// Captures a still frame from a video file as a data URL, so clip drops have
// a real representative image — every view renders drop media as <img>, none
// of them play actual video.
export function captureVideoPosterFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Could not read video specimen.'));
    });

    video.addEventListener('loadeddata', () => {
      const seekTo = Math.min(0.2, (video.duration || 1) / 2);
      const grabFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unsupported');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      if (video.readyState >= 2) {
        video.currentTime = seekTo;
        video.addEventListener('seeked', grabFrame, { once: true });
      } else {
        grabFrame();
      }
    });
  });
}
