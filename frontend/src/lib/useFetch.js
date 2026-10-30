import { useCallback, useEffect, useState } from "react";

/** const { data, loading, error, reload } = useFetch(() => getClaims(), []) */
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    run().then((data) => setState({ data, loading: false, error: null }))
         .catch((error) => setState({ data: null, loading: false, error }));
  }, [run]);
  useEffect(reload, [reload]);
  return { ...state, reload };
}
