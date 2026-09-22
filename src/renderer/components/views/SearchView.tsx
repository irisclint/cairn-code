import { useCallback, useState, type JSX } from 'react';
import type { SearchFileResult } from '@shared/types';
import { Icon } from '../common/Icon';
import { useWorkspaceStore } from '../../store/workspace-store';
import { useEditorStore } from '../../store/editor-store';
import { useNotificationStore } from '../../store/notification-store';
import { api, unwrap } from '../../services/api';
import { getActiveEditor } from '../../services/register-commands';
import { relativeTo, basename } from '@shared/utils';

/** Workspace-wide content search with regex, case and whole word toggles. */
export function SearchView(): JSX.Element {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const openFile = useEditorStore((state) => state.openFile);
  const notifyError = useNotificationStore((state) => state.notifyError);

  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [includeGlob, setIncludeGlob] = useState('');
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(async () => {
    if (query.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const found = await unwrap(
        api().search.inFiles({
          query,
          isRegex,
          matchCase,
          wholeWord,
          includeGlob: includeGlob.trim() || undefined
        })
      );
      setResults(found);
      setHasSearched(true);
    } catch (error) {
      notifyError(error, 'The search could not be completed');
    } finally {
      setIsSearching(false);
    }
  }, [query, isRegex, matchCase, wholeWord, includeGlob, notifyError]);

  /** Opens the file and moves the caret onto the matched range. */
  const revealMatch = useCallback(
    async (path: string, lineNumber: number, column: number, length: number) => {
      await openFile(path);
      const editor = getActiveEditor();
      if (!editor) return;
      const range = {
        startLineNumber: lineNumber,
        startColumn: column + 1,
        endLineNumber: lineNumber,
        endColumn: column + 1 + length
      };
      editor.revealRangeInCenter(range);
      editor.setSelection(range);
      editor.focus();
    },
    [openFile]
  );

  const totalMatches = results.reduce((sum, result) => sum + result.matches.length, 0);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Search</h2>
      </div>

      <div className="search__controls">
        <div className="search__input-row">
          <input
            className="input"
            placeholder="Search"
            aria-label="Search text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
          />
        </div>

        <div className="search__toggles" role="group" aria-label="Search options">
          <button
            type="button"
            className={'search__toggle' + (matchCase ? ' search__toggle--active' : '')}
            aria-pressed={matchCase}
            title="Match Case"
            onClick={() => setMatchCase((value) => !value)}
          >
            Aa
          </button>
          <button
            type="button"
            className={'search__toggle' + (wholeWord ? ' search__toggle--active' : '')}
            aria-pressed={wholeWord}
            title="Match Whole Word"
            onClick={() => setWholeWord((value) => !value)}
          >
            ab
          </button>
          <button
            type="button"
            className={'search__toggle' + (isRegex ? ' search__toggle--active' : '')}
            aria-pressed={isRegex}
            title="Use Regular Expression"
            onClick={() => setIsRegex((value) => !value)}
          >
            .*
          </button>
        </div>

        <input
          className="input input--small"
          placeholder="Files to include, for example src/**/*.ts"
          aria-label="Files to include"
          value={includeGlob}
          onChange={(event) => setIncludeGlob(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch();
          }}
        />

        <button
          type="button"
          className="button button--block"
          disabled={!rootPath || isSearching}
          onClick={() => void runSearch()}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {!rootPath ? (
        <p className="sidebar-view__hint">Open a folder to search across files.</p>
      ) : hasSearched ? (
        <p className="search__summary">
          {totalMatches} {totalMatches === 1 ? 'result' : 'results'} in {results.length}{' '}
          {results.length === 1 ? 'file' : 'files'}
        </p>
      ) : null}

      <div className="search__results">
        {results.map((result) => (
          <details key={result.path} open className="search__file">
            <summary className="search__file-header" title={result.path}>
              <Icon name="file" size={14} />
              <span className="search__file-name">{basename(result.path)}</span>
              <span className="search__file-path">{relativeTo(rootPath, result.path)}</span>
              <span className="search__file-count">{result.matches.length}</span>
            </summary>
            {result.matches.map((match, index) => (
              <button
                type="button"
                key={match.lineNumber + ':' + match.column + ':' + index}
                className="search__match"
                onClick={() => void revealMatch(result.path, match.lineNumber, match.column, match.length)}
              >
                <span className="search__match-line">{match.lineNumber}</span>
                <span className="search__match-text">
                  {match.lineText.slice(0, match.column)}
                  <mark>{match.lineText.slice(match.column, match.column + match.length)}</mark>
                  {match.lineText.slice(match.column + match.length)}
                </span>
              </button>
            ))}
          </details>
        ))}
      </div>
    </div>
  );
}
