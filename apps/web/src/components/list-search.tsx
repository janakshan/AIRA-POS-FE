import { SearchInput, type SearchInputProps } from '@rbp/ui';
import { useState } from 'react';

/**
 * Search box for URL-driven list pages: typing stays local and only the debounced value is
 * committed (one request per pause, not per keystroke).
 */
export function ListSearch({
  value,
  onSearch,
  ...props
}: Omit<SearchInputProps, 'value' | 'onValueChange' | 'onSearch'> & {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Follow external changes (back/forward, cleared filters).
  const [committed, setCommitted] = useState(value);
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }
  return (
    <SearchInput
      value={draft}
      onValueChange={setDraft}
      onSearch={(v) => v !== value && onSearch(v)}
      {...props}
    />
  );
}
