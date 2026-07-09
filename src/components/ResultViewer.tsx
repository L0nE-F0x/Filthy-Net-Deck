import { useAppStore } from "../store/useAppStore";

/**
 * In-app results panel. Many tournament sites block iframe embedding (X-Frame-Options),
 * so we embed when possible and always offer "Open in browser".
 */
export function ResultViewer() {
  const url = useAppStore((s) => s.viewerUrl);
  const close = useAppStore((s) => s.closeViewer);
  if (!url) return null;

  return (
    <div className="viewer-overlay" role="dialog" aria-modal="true" aria-label="Results viewer">
      <div className="viewer-panel">
        <header className="viewer-header">
          <div className="viewer-url" title={url}>
            {url}
          </div>
          <div className="flex gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Open in browser
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
              Close
            </button>
          </div>
        </header>
        <iframe
          title="Tournament results"
          src={url}
          className="viewer-frame"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <p className="viewer-hint">
          If the page is blank, the site blocks embedding — use Open in browser.
        </p>
      </div>
    </div>
  );
}
