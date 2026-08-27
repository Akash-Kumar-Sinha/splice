use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::ThumbError;

#[derive(Debug, Clone)]
pub struct ExportClip {
    pub media_path: PathBuf,
    pub in_point: f64,
    pub out_point: f64,
}

pub fn render_export_mp4(clips: &[ExportClip], output_path: &Path) -> Result<(), ThumbError> {
    if clips.is_empty() {
        return Err(ThumbError::FfmpegFailed(
            "No clips provided to export".to_string(),
        ));
    }

    if clips.len() == 1 {
        // INFO: Single clip fast render and trim
        let clip = &clips[0];
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
            .arg("fast")
            .arg("-crf")
            .arg("22")
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("192k")
            .arg("-avoid_negative_ts")
            .arg("make_zero")
            .arg("-f")
            .arg("mp4")
            .arg(output_path)
            .status()?;

        if !status.success() {
            return Err(ThumbError::FfmpegFailed(format!(
                "FFmpeg failed with exit code: {:?}",
                status.code()
            )));
        }
        return Ok(());
    }

    // CRITICAL: Multi-clip concatenation: render each trimmed clip segment to a temporary directory, then concatenate
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
            .arg("-c:a")
            .arg("aac")
            .arg("-f")
            .arg("mpegts")
            .arg(&seg_path)
            .status()?;

        if !status.success() {
            return Err(ThumbError::FfmpegFailed(format!(
                "FFmpeg failed to render segment {i}"
            )));
        }
        segment_paths.push(seg_path);
    }

    // INFO: Create concat list file
    let concat_file_path = temp_dir.path().join("concat_list.txt");
    let mut concat_file = File::create(&concat_file_path)?;
    for seg in &segment_paths {
        writeln!(concat_file, "file '{}'", seg.display())?;
    }
    concat_file.flush()?;

    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&concat_file_path)
        .arg("-c")
        .arg("copy")
        .arg("-f")
        .arg("mp4")
        .arg(output_path)
        .status()?;

    if !status.success() {
        return Err(ThumbError::FfmpegFailed(
            "FFmpeg failed to concatenate segments".to_string(),
        ));
    }

    Ok(())
}
