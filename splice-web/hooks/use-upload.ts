import { API_URL } from '@/lib/api';

export function useUpload() {
  return (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ hash: string; duration: number }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          if (onProgress) onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            reject(new Error('Invalid JSON response from server'));
          }
        } else {
          reject(new Error(`Upload failed with status: ${xhr.statusText || xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      xhr.open('POST', `${API_URL}/media`);
      xhr.send(form);
    });
  };
}
