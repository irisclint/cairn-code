import { useEffect, useState } from 'react';
import type { Diagnostic } from '@shared/types';
import { diagnosticService, type DiagnosticCounts } from '../services/diagnostic-service';

/** Subscribes to the diagnostic counts shown in the status and activity bars. */
export function useProblemCounts(): DiagnosticCounts {
  const [counts, setCounts] = useState<DiagnosticCounts>(() => diagnosticService.counts());

  useEffect(() => {
    setCounts(diagnosticService.counts());
    return diagnosticService.onDidChange(() => setCounts(diagnosticService.counts()));
  }, []);

  return counts;
}

/** Subscribes to every diagnostic, sorted for the Problems panel. */
export function useProblems(): Diagnostic[] {
  const [problems, setProblems] = useState<Diagnostic[]>(() => diagnosticService.getFlattened());

  useEffect(() => {
    setProblems(diagnosticService.getFlattened());
    return diagnosticService.onDidChange(() => setProblems(diagnosticService.getFlattened()));
  }, []);

  return problems;
}

/** Subscribes to the diagnostics of a single file. */
export function useFileProblems(uri: string | null): Diagnostic[] {
  const [problems, setProblems] = useState<Diagnostic[]>(() => (uri ? diagnosticService.get(uri) : []));

  useEffect(() => {
    if (!uri) {
      setProblems([]);
      return undefined;
    }
    setProblems(diagnosticService.get(uri));
    return diagnosticService.onDidChange(() => setProblems(diagnosticService.get(uri)));
  }, [uri]);

  return problems;
}
