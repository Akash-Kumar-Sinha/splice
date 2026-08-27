use std::path::Path;
use std::process::Command;
use std::time::Duration;

use crate::error::ThumbError;

pub trait ThumbnailGenerator: Send + Sync {
    fn generate(&self, media_path: &Path, at: Duration) -> Result<Vec<u8>, ThumbError>;
}

#[derive(Debug, Default, Clone)]
pub struct FfmpegThumbnailer;

impl FfmpegThumbnailer {
    pub fn new() -> Self {
        Self
    }

    pub fn generate_fallback_jpeg(label: &str) -> Vec<u8> {
        // INFO: Generate minimal valid 1x1 or styled fallback JPEG buffer when video frame grab is unavailable
        let header = [
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
            0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06,
            0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D,
            0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
            0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28,
            0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,
            0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
            0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
            0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01,
            0x01, 0x00, 0x00, 0x3F, 0x00, 0xBF, 0x00, 0xFF, 0xD9,
        ];
        let _ = label;
        header.to_vec()
    }
}

impl ThumbnailGenerator for FfmpegThumbnailer {
    fn generate(&self, media_path: &Path, at: Duration) -> Result<Vec<u8>, ThumbError> {
        if !media_path.exists() {
            return Err(ThumbError::InvalidPath(media_path.to_path_buf()));
        }

        let at_secs = format!("{:.3}", at.as_secs_f64());

        // INFO: Shell out to ffmpeg to grab a single frame and output JPEG bytes to stdout
        let output = Command::new("ffmpeg")
            .arg("-ss")
            .arg(&at_secs)
            .arg("-i")
            .arg(media_path)
            .arg("-vframes")
            .arg("1")
            .arg("-vf")
            .arg("scale=320:-1")
            .arg("-f")
            .arg("image2")
            .arg("-c:v")
            .arg("mjpeg")
            .arg("pipe:1")
            .output();

        match output {
            Ok(out) if out.status.success() && !out.stdout.is_empty() => Ok(out.stdout),
            Ok(out) => {
                // INFO: Fallback when ffmpeg cannot extract video frame
                let stderr_msg = String::from_utf8_lossy(&out.stderr).to_string();
                tracing::warn!("FFmpeg thumbnail extraction returned empty/failure: {stderr_msg}");
                Ok(Self::generate_fallback_jpeg(
                    media_path.to_string_lossy().as_ref(),
                ))
            }
            Err(e) => {
                tracing::warn!("FFmpeg process execution failed ({e}), using fallback thumbnail");
                Ok(Self::generate_fallback_jpeg(
                    media_path.to_string_lossy().as_ref(),
                ))
            }
        }
    }
}
