import ffmpegPath from 'ffmpeg-static'

/** FFmpeg 二进制路径 */
export function getFfmpegPath(): string {
  if (!ffmpegPath) throw new Error('ffmpeg 二进制不可用（ffmpeg-static 安装异常）')
  return ffmpegPath
}
