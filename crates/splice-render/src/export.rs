use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::RenderError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    #[default]
    H264,
    ProRes,
}

impl ExportFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            Self::H264 => "mp4",
            Self::ProRes => "mov",
        }
    }

    pub fn content_type(&self) -> &'static str {
        match self {
            Self::H264 => "video/mp4",
            Self::ProRes => "video/quicktime",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExportClip {
    pub media_path: PathBuf,
    pub in_point: f64,
    pub out_point: f64,
}

pub fn render_export_mp4(clips: &[ExportClip], output_path: &Path) -> Result<(), RenderError> {
    render_export_format(clips, output_path, ExportFormat::H264)
}

pub fn render_export_format(
    clips: &[ExportClip],
    output_path: &Path,
    format: ExportFormat,
) -> Result<(), RenderError> {
    if clips.is_empty() {
        return Err(RenderError::EmptyTimeline);
    }

    if clips.len() == 1 {
        let clip = &clips[0];
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y")
            .arg("-ss")
            .arg(format!("{:.3}", clip.in_point))
            .arg("-to")
            .arg(format!("{:.3}", clip.out_point))
            .arg("-i")
            .arg(&clip.media_path);

        match format {
            ExportFormat::H264 => {
                // CRITICAL: Full-res H.264 high quality render
                cmd.arg("-c:v")
                    .arg("libx264")
                    .arg("-preset")
                    .arg("fast")
                    .arg("-crf")
                    .arg("18")
                    .arg("-c:a")
                    .arg("aac")
                    .arg("-b:a")
                    .arg("320k")
                    .arg("-avoid_negative_ts")
                    .arg("make_zero")
                    .arg("-f")
                    .arg("mp4")
                    .arg(output_path);
            }
            ExportFormat::ProRes => {
                // CRITICAL: Apple ProRes 422 standard master render
                cmd.arg("-c:v")
                    .arg("prores_ks")
                    .arg("-profile:v")
                    .arg("2")
                    .arg("-vendor")
                    .arg("apl0")
                    .arg("-pix_fmt")
                    .arg("yuv422p10le")
                    .arg("-c:a")
                    .arg("pcm_s16le")
                    .arg("-avoid_negative_ts")
                    .arg("make_zero")
                    .arg("-f")
                    .arg("mov")
                    .arg(output_path);
            }
        }

        let status = cmd.status()?;
        if !status.success() {
            return Err(RenderError::FfmpegFailed(format!(
                "FFmpeg full-res export failed with code: {:?}",
                status.code()
            )));
        }
        return Ok(());
    }

    // CRITICAL: Multi-clip export concatenation
    let temp_dir = tempfile::tempdir()?;
    let mut segment_paths = Vec::new();

    for (i, clip) in clips.iter().enumerate() {
        let seg_path = temp_dir.path().join(format!("seg_{i}.ts"));
        let status = Command::new("ffmpeg")
            .arg("-y")
            .arg("-ss")
            .arg(format!("{:.3}", clip.in_point))
            .arg("-to")
            .arg(format!("{:.3}", clip.out_point))
            .arg("-i")
            .arg(&clip.media_path)
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("ultrafast")
            .arg("-crf")
            .arg("18")
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("320k")
            .arg("-f")
            .arg("mpegts")
            .arg(&seg_path)
            .status()?;

        if !status.success() {
            return Err(RenderError::FfmpegFailed(format!(
                "FFmpeg failed to render segment {i}"
            )));
        }
        segment_paths.push(seg_path);
    }

    let concat_file_path = temp_dir.path().join("concat_list.txt");
    let mut concat_file = File::create(&concat_file_path)?;
    for seg in &segment_paths {
        writeln!(concat_file, "file '{}'", seg.display())?;
    }
    concat_file.flush()?;

    let mut concat_cmd = Command::new("ffmpeg");
    concat_cmd
        .arg("-y")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&concat_file_path);

    match format {
        ExportFormat::H264 => {
            concat_cmd
                .arg("-c")
                .arg("copy")
                .arg("-f")
                .arg("mp4")
                .arg(output_path);
        }
        ExportFormat::ProRes => {
            concat_cmd
                .arg("-c:v")
                .arg("prores_ks")
                .arg("-profile:v")
                .arg("2")
                .arg("-c:a")
                .arg("pcm_s16le")
                .arg("-f")
                .arg("mov")
                .arg(output_path);
        }
    }

    let status = concat_cmd.status()?;
    if !status.success() {
        return Err(RenderError::FfmpegFailed(
            "FFmpeg failed to concatenate export segments".to_string(),
        ));
    }

    Ok(())
}
