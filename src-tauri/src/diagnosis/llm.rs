//! Multi-provider cloud diagnosis: xAI (SpaceXAI), OpenAI, and Google Gemini.
//!
//! Selection:
//! 1. `DEVICELIFELINE_LLM_PROVIDER` = `xai` | `openai` | `gemini` when that key is set
//! 2. Otherwise first available key in order: XAI → OpenAI → Gemini
//!
//! Falls back to offline heuristics when no key is set or the request fails.
//! Keys are read only in the Rust process (never shipped in the Vite bundle).

use crate::diagnosis::provider::{DiagnosisProvider, FindingDraft, HeuristicProvider};
use crate::models::DiagnosisContext;

const XAI_BASE: &str = "https://api.x.ai/v1";
const XAI_MODEL: &str = "grok-4.5";
const OPENAI_BASE: &str = "https://api.openai.com/v1";
const OPENAI_MODEL: &str = "gpt-4o-mini";
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL: &str = "gemini-2.0-flash";

/// Which cloud backend is active.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LlmBackend {
    Xai,
    OpenAi,
    Gemini,
}

impl LlmBackend {
    pub fn as_str(self) -> &'static str {
        match self {
            LlmBackend::Xai => "xai",
            LlmBackend::OpenAi => "openai",
            LlmBackend::Gemini => "gemini",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "xai" | "spacexai" | "grok" => Some(LlmBackend::Xai),
            "openai" | "gpt" => Some(LlmBackend::OpenAi),
            "gemini" | "google" => Some(LlmBackend::Gemini),
            _ => None,
        }
    }
}

/// Returns true when at least one cloud LLM API key is configured.
pub fn llm_configured() -> bool {
    !configured_providers().is_empty()
}

/// List of provider slugs that currently have keys set.
pub fn configured_providers() -> Vec<&'static str> {
    let mut out = Vec::new();
    if env_nonempty("XAI_API_KEY") {
        out.push("xai");
    }
    if env_nonempty("OPENAI_API_KEY") {
        out.push("openai");
    }
    if env_nonempty("GEMINI_API_KEY") || env_nonempty("GOOGLE_API_KEY") {
        out.push("gemini");
    }
    out
}

/// Active provider slug and model for status UI.
pub fn active_provider_status() -> (String, String, bool) {
    match LlmProvider::from_env() {
        Some(p) => (p.backend.as_str().into(), p.model.clone(), true),
        None => ("heuristic".into(), "offline".into(), false),
    }
}

fn env_nonempty(key: &str) -> bool {
    std::env::var(key)
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false)
}

fn env_key(key: &str) -> Option<String> {
    let v = std::env::var(key).ok()?.trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

/// Remote multi-backend provider. On failure, delegates to heuristics.
pub struct LlmProvider {
    backend: LlmBackend,
    api_key: String,
    base_url: String,
    model: String,
}

impl LlmProvider {
    /// Resolves the active provider from environment variables.
    pub fn from_env() -> Option<Self> {
        // Explicit preference when set and that key exists.
        if let Ok(pref) = std::env::var("DEVICELIFELINE_LLM_PROVIDER") {
            if let Some(backend) = LlmBackend::parse(&pref) {
                if let Some(p) = Self::for_backend(backend) {
                    return Some(p);
                }
            }
        }
        // Auto: xAI → OpenAI → Gemini
        Self::for_backend(LlmBackend::Xai)
            .or_else(|| Self::for_backend(LlmBackend::OpenAi))
            .or_else(|| Self::for_backend(LlmBackend::Gemini))
    }

    fn for_backend(backend: LlmBackend) -> Option<Self> {
        match backend {
            LlmBackend::Xai => {
                let api_key = env_key("XAI_API_KEY")?;
                Some(Self {
                    backend,
                    api_key,
                    base_url: std::env::var("XAI_BASE_URL").unwrap_or_else(|_| XAI_BASE.into()),
                    model: std::env::var("XAI_MODEL").unwrap_or_else(|_| XAI_MODEL.into()),
                })
            }
            LlmBackend::OpenAi => {
                let api_key = env_key("OPENAI_API_KEY")?;
                Some(Self {
                    backend,
                    api_key,
                    base_url: std::env::var("OPENAI_BASE_URL")
                        .unwrap_or_else(|_| OPENAI_BASE.into()),
                    model: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| OPENAI_MODEL.into()),
                })
            }
            LlmBackend::Gemini => {
                let api_key = env_key("GEMINI_API_KEY").or_else(|| env_key("GOOGLE_API_KEY"))?;
                Some(Self {
                    backend,
                    api_key,
                    base_url: std::env::var("GEMINI_BASE_URL")
                        .unwrap_or_else(|_| GEMINI_BASE.into()),
                    model: std::env::var("GEMINI_MODEL").unwrap_or_else(|_| GEMINI_MODEL.into()),
                })
            }
        }
    }
}

impl DiagnosisProvider for LlmProvider {
    fn diagnose(&self, query: &str, context: &DiagnosisContext) -> Vec<FindingDraft> {
        match self.call_llm(query, context) {
            Ok(findings) if !findings.is_empty() => findings,
            Ok(_) => HeuristicProvider::new().diagnose(query, context),
            Err(err) => {
                log::warn!(
                    "LLM diagnosis failed ({}), using heuristics: {err}",
                    self.backend.as_str()
                );
                let mut drafts = HeuristicProvider::new().diagnose(query, context);
                drafts.insert(
                    0,
                    FindingDraft {
                        title: "Cloud copilot unavailable".into(),
                        cause: format!(
                            "Fell back to on-device rules after the {} model call failed.",
                            self.backend.as_str()
                        ),
                        evidence: err,
                        confidence: 40,
                        suggested_action: format!(
                            "Check {} API key / network, or set DEVICELIFELINE_LLM_PROVIDER.",
                            self.backend.as_str()
                        ),
                    },
                );
                drafts
            }
        }
    }
}

const SYSTEM_PROMPT: &str = r#"You are DeviceLifeline Copilot, an on-device PC systems engineer.
Given the user's question and structured telemetry JSON, return ONLY a JSON array of findings.
Each finding object must have: title, cause, evidence, confidence (0-100 integer), suggestedAction.
Max 6 findings. Be specific. Never invent hardware that is not in the context.
No markdown, no prose outside JSON."#;

impl LlmProvider {
    fn call_llm(
        &self,
        query: &str,
        context: &DiagnosisContext,
    ) -> Result<Vec<FindingDraft>, String> {
        let user = serde_json::json!({
            "query": query,
            "context": context,
        })
        .to_string();

        match self.backend {
            LlmBackend::Xai | LlmBackend::OpenAi => self.call_openai_compatible(&user),
            LlmBackend::Gemini => self.call_gemini(&user),
        }
    }

    fn call_openai_compatible(&self, user: &str) -> Result<Vec<FindingDraft>, String> {
        let body = serde_json::json!({
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": user }
            ]
        });

        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let resp = ureq::post(&url)
            .set("Authorization", &format!("Bearer {}", self.api_key))
            .set("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(45))
            .send_json(body)
            .map_err(|e| format!("request error: {e}"))?;

        if resp.status() >= 300 {
            return Err(format!("HTTP {}", resp.status()));
        }

        let value: serde_json::Value = resp.into_json().map_err(|e| format!("parse error: {e}"))?;

        let content = value
            .pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
            .ok_or_else(|| "missing message content".to_string())?;

        parse_findings_json(content)
    }

    fn call_gemini(&self, user: &str) -> Result<Vec<FindingDraft>, String> {
        // Gemini generateContent API (API key as query param).
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url.trim_end_matches('/'),
            self.model,
            urlencoding_minimal(&self.api_key)
        );

        let body = serde_json::json!({
            "systemInstruction": {
                "parts": [{ "text": SYSTEM_PROMPT }]
            },
            "contents": [{
                "role": "user",
                "parts": [{ "text": user }]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        });

        let resp = ureq::post(&url)
            .set("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(45))
            .send_json(body)
            .map_err(|e| format!("request error: {e}"))?;

        if resp.status() >= 300 {
            return Err(format!("HTTP {}", resp.status()));
        }

        let value: serde_json::Value = resp.into_json().map_err(|e| format!("parse error: {e}"))?;

        let content = value
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|c| c.as_str())
            .ok_or_else(|| "missing Gemini text content".to_string())?;

        parse_findings_json(content)
    }
}

/// Minimal query-string encode for API keys (alphanumeric + -_ typically).
fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn parse_findings_json(content: &str) -> Result<Vec<FindingDraft>, String> {
    let trimmed = content.trim();
    let stripped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .strip_suffix("```")
        .unwrap_or(trimmed)
        .trim();

    let arr: Vec<serde_json::Value> = serde_json::from_str(stripped)
        .or_else(|_| {
            let obj: serde_json::Value = serde_json::from_str(stripped)?;
            obj.get("findings")
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok())
                .ok_or_else(|| {
                    serde_json::Error::io(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "no findings array",
                    ))
                })
        })
        .map_err(|e| format!("findings JSON: {e}"))?;

    let mut out = Vec::new();
    for item in arr {
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Finding")
            .to_string();
        let cause = item
            .get("cause")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let evidence = item
            .get("evidence")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let confidence = item
            .get("confidence")
            .and_then(|v| v.as_i64())
            .unwrap_or(50)
            .clamp(0, 100);
        let suggested_action = item
            .get("suggestedAction")
            .or_else(|| item.get("suggested_action"))
            .and_then(|v| v.as_str())
            .unwrap_or("Review the evidence and apply a safe fix.")
            .to_string();
        out.push(FindingDraft {
            title,
            cause,
            evidence,
            confidence,
            suggested_action,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_array() {
        let raw =
            r#"[{"title":"T","cause":"C","evidence":"E","confidence":80,"suggestedAction":"A"}]"#;
        let f = parse_findings_json(raw).unwrap();
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].title, "T");
    }

    #[test]
    fn backend_parse() {
        assert_eq!(LlmBackend::parse("xai"), Some(LlmBackend::Xai));
        assert_eq!(LlmBackend::parse("openai"), Some(LlmBackend::OpenAi));
        assert_eq!(LlmBackend::parse("gemini"), Some(LlmBackend::Gemini));
        assert_eq!(LlmBackend::parse("nope"), None);
    }

    #[test]
    fn urlencode_key() {
        assert_eq!(urlencoding_minimal("abc-123"), "abc-123");
        assert!(urlencoding_minimal("a+b").contains("%2B"));
    }
}
