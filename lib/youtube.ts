export interface YouTubeInfo {
  title: string;
  author: string;
  thumbnail: string;
}

export async function getYoutubeVideoInfo(url: string): Promise<YouTubeInfo> {
  try {
    const cleanUrl = url.trim();
    // Validate if it is indeed a youtube link
    const isYoutube = /youtube\.com|youtu\.be/i.test(cleanUrl);
    if (!isYoutube) {
      return { title: 'External Media', author: '', thumbnail: '' };
    }

    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || 'YouTube Video',
        author: data.author_name || 'YouTube Channel',
        thumbnail: data.thumbnail_url || ''
      };
    }
  } catch (error) {
    console.error('Error fetching YouTube info:', error);
  }
  return { title: 'YouTube Video', author: '', thumbnail: '' };
}

export function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
