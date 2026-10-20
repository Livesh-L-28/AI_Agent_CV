"""
Synthetic Video and Frame Generator for Deterministic Testing and Recruiter Demos.
Generates a 5-second 640x480 video with a moving worker and defined safety zone.
"""

from pathlib import Path
import cv2
import numpy as np


def generate_synthetic_safety_video(
    output_path: Path,
    width: int = 640,
    height: int = 480,
    fps: int = 25,
    duration_sec: int = 5,
) -> Path:
    """Generates an MP4 video with a simulated worker walking across a floor."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

    total_frames = fps * duration_sec

    # Safety zone polygon points (in lower-right quadrant: x: 350-580, y: 220-440)
    zone_pts = np.array([[360, 240], [580, 240], [580, 440], [360, 440]], np.int32)

    for frame_idx in range(total_frames):
        # Slate background (industrial floor)
        frame = np.full((height, width, 3), (35, 40, 45), dtype=np.uint8)

        # Draw floor markings (grid lines)
        for y in range(100, height, 80):
            cv2.line(frame, (0, y), (width, y), (50, 55, 60), 1)

        # Draw Restricted Zone (amber diagonal hatching and red border)
        overlay = frame.copy()
        cv2.fillPoly(overlay, [zone_pts], (0, 0, 180))  # Semi-transparent red
        cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)
        cv2.polylines(frame, [zone_pts], isClosed=True, color=(0, 0, 255), thickness=2)
        cv2.putText(
            frame,
            "RESTRICTED ZONE A-1",
            (370, 230),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 255),
            1,
            cv2.LINE_AA,
        )

        # Worker moves from left (x=100) to right (x=500, entering the zone around frame 60)
        progress = frame_idx / total_frames
        worker_center_x = int(100 + progress * 400)
        worker_center_y = int(320)

        # Draw stylized worker figure:
        # Head (with yellow hardhat)
        cv2.circle(frame, (worker_center_x, worker_center_y - 70), 16, (200, 200, 200), -1)  # Head
        cv2.ellipse(frame, (worker_center_x, worker_center_y - 78), (18, 10), 0, 180, 360, (0, 215, 255), -1)  # Yellow Helmet

        # Torso (with orange high-vis vest)
        cv2.rectangle(
            frame,
            (worker_center_x - 18, worker_center_y - 50),
            (worker_center_x + 18, worker_center_y + 10),
            (0, 140, 255),  # Safety orange
            -1,
        )
        # Silver reflective stripes on vest
        cv2.line(frame, (worker_center_x - 18, worker_center_y - 30), (worker_center_x + 18, worker_center_y - 30), (220, 220, 220), 2)
        cv2.line(frame, (worker_center_x - 18, worker_center_y - 10), (worker_center_x + 18, worker_center_y - 10), (220, 220, 220), 2)

        # Legs (dark navy)
        leg_offset = int(np.sin(frame_idx * 0.4) * 8)
        cv2.line(frame, (worker_center_x - 8, worker_center_y + 10), (worker_center_x - 10 + leg_offset, worker_center_y + 60), (120, 60, 40), 6)
        cv2.line(frame, (worker_center_x + 8, worker_center_y + 10), (worker_center_x + 10 - leg_offset, worker_center_y + 60), (120, 60, 40), 6)

        # Frame counter & metadata overlay
        cv2.putText(
            frame,
            f"FRAME: {frame_idx:04d} | TIME: {frame_idx/fps:0.2f}s | SENTINEL-TEST-FEED",
            (15, 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )

        writer.write(frame)

    writer.release()
    return output_path


def generate_synthetic_frame(output_path: Path, width: int = 640, height: int = 480) -> Path:
    """Generates a single synthetic test frame."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame = np.full((height, width, 3), (35, 40, 45), dtype=np.uint8)

    # Worker at center
    cx, cy = width // 2, height // 2
    cv2.circle(frame, (cx, cy - 70), 16, (200, 200, 200), -1)
    cv2.ellipse(frame, (cx, cy - 78), (18, 10), 0, 180, 360, (0, 215, 255), -1)
    cv2.rectangle(frame, (cx - 18, cy - 50), (cx + 18, cy + 10), (0, 140, 255), -1)
    cv2.line(frame, (cx - 8, cy + 10), (cx - 8, cy + 60), (120, 60, 40), 6)
    cv2.line(frame, (cx + 8, cy + 10), (cx + 8, cy + 60), (120, 60, 40), 6)

    cv2.imwrite(str(output_path), frame)
    return output_path


if __name__ == "__main__":
    vid_path = Path("data/fixtures/synthetic_safety_video.mp4")
    frame_path = Path("data/fixtures/synthetic_frame.jpg")
    print(f"Generating synthetic video: {generate_synthetic_safety_video(vid_path)}")
    print(f"Generating synthetic frame: {generate_synthetic_frame(frame_path)}")
