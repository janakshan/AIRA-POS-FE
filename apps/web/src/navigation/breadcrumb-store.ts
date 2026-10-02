import { useEffect } from 'react';
import { create } from 'zustand';

/** Title of the record a detail page shows, used as the third breadcrumb (Group › Item › Record). */
export const useBreadcrumbStore = create<{ detail: string | null }>()(() => ({ detail: null }));

/** Set the detail breadcrumb while the calling page is mounted. */
export function useBreadcrumbTitle(title: string | null | undefined) {
  useEffect(() => {
    useBreadcrumbStore.setState({ detail: title ?? null });
    return () => useBreadcrumbStore.setState({ detail: null });
  }, [title]);
}
