import { Trans } from 'react-i18next';

const COMPONENTS = { b: <b className="font-semibold text-foreground" /> };

/** Guide copy with on-screen labels marked as <b>…</b> in the locale files. */
export function GuideText({ k }: { k: string }) {
  return <Trans ns="guide" i18nKey={k} components={COMPONENTS} />;
}
