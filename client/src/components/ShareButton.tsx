import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: 'A.R.E.N.A. — AI Debate Arena',
      text: 'Watch AI personalities clash in real-time. Vote, inject chaos, and challenge them directly!',
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title={copied ? 'Copied!' : 'Share'}
    >
      {copied ? <Check size={14} className="text-success" /> : <Share2 size={14} />}
    </button>
  );
}
