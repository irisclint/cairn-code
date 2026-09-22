import { useCallback, useEffect, useState, type JSX } from 'react';
import type { DirectoryEntry } from '@shared/types';
import { Icon } from '../common/Icon';
import { FileIcon, FolderIcon } from '../common/FileIcon';
import { useWorkspaceStore } from '../../store/workspace-store';
import { useEditorStore } from '../../store/editor-store';
import { commandService } from '../../services/command-service';
import { api, hasBridge } from '../../services/api';

interface TreeRowProps {
  entry: DirectoryEntry;
  depth: number;
}

function TreeRow({ entry, depth }: TreeRowProps): JSX.Element {
  const expanded = useWorkspaceStore((state) => state.expanded);
  const tree = useWorkspaceStore((state) => state.tree);
  const selectedPath = useWorkspaceStore((state) => state.selectedPath);
  const toggleExpanded = useWorkspaceStore((state) => state.toggleExpanded);
  const select = useWorkspaceStore((state) => state.select);
  const openFile = useEditorStore((state) => state.openFile);

  const isExpanded = expanded.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const children = tree.get(entry.path);

  const activate = useCallback(() => {
    select(entry.path);
    if (entry.isDirectory) void toggleExpanded(entry.path);
    else void openFile(entry.path);
  }, [entry.path, entry.isDirectory, select, toggleExpanded, openFile]);

  return (
    <>
      <div
        className={'explorer__row' + (isSelected ? ' explorer__row--selected' : '')}
        style={{ paddingLeft: depth * 12 + 8 }}
        role="treeitem"
        aria-expanded={entry.isDirectory ? isExpanded : undefined}
        aria-selected={isSelected}
        tabIndex={isSelected ? 0 : -1}
        title={entry.path}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        }}
      >
        {entry.isDirectory ? (
          <Icon
            name={isExpanded ? 'chevron-down' : 'chevron-right'}
            size={14}
            className="explorer__chevron"
          />
        ) : (
          <span className="explorer__chevron explorer__chevron--placeholder" />
        )}
        {entry.isDirectory ? (
          <FolderIcon open={isExpanded} size={15} className="explorer__icon explorer__icon--folder" />
        ) : (
          <FileIcon path={entry.path} size={15} className="explorer__icon" />
        )}
        <span className="explorer__label">{entry.name}</span>
      </div>

      {entry.isDirectory && isExpanded && children
        ? children.map((child) => <TreeRow key={child.path} entry={child} depth={depth + 1} />)
        : null}
    </>
  );
}

/** Workspace file tree. */
export function ExplorerView(): JSX.Element {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const name = useWorkspaceStore((state) => state.name);
  const tree = useWorkspaceStore((state) => state.tree);
  const loadDirectory = useWorkspaceStore((state) => state.loadDirectory);
  const createEntry = useWorkspaceStore((state) => state.createEntry);
  const applyFileEvents = useWorkspaceStore((state) => state.applyFileEvents);
  const openFile = useEditorStore((state) => state.openFile);
  const [pendingCreate, setPendingCreate] = useState<'file' | 'folder' | null>(null);
  const [draftName, setDraftName] = useState('');

  /* Refresh the tree when the watcher reports changes on disk. */
  useEffect(() => {
    if (!hasBridge()) return undefined;
    return api().workspace.onFileEvents((events) => {
      void applyFileEvents(events);
    });
  }, [applyFileEvents]);

  const rootEntries = rootPath ? (tree.get(rootPath) ?? []) : [];

  const submitDraft = useCallback(async () => {
    if (!rootPath || !pendingCreate || draftName.trim().length === 0) {
      setPendingCreate(null);
      setDraftName('');
      return;
    }
    const created = await createEntry(rootPath, draftName.trim(), pendingCreate === 'folder');
    setPendingCreate(null);
    setDraftName('');
    if (created && pendingCreate === 'file') void openFile(created);
  }, [rootPath, pendingCreate, draftName, createEntry, openFile]);

  if (!rootPath) {
    return (
      <div className="sidebar-view">
        <div className="sidebar-view__header">
          <h2 className="sidebar-view__title">Explorer</h2>
        </div>
        <div className="sidebar-view__empty">
          <p>No folder is open yet.</p>
          <button
            type="button"
            className="button button--block"
            onClick={() => void commandService.execute('file.openFolder')}
          >
            Open Folder
          </button>
          <p className="sidebar-view__hint">
            Opening a folder gives you the file tree, workspace search and source control.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-view">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">{name}</h2>
        <div className="sidebar-view__actions">
          <button
            type="button"
            className="icon-button"
            aria-label="New File"
            title="New File"
            onClick={() => {
              setPendingCreate('file');
              setDraftName('');
            }}
          >
            <Icon name="new-file" size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="New Folder"
            title="New Folder"
            onClick={() => {
              setPendingCreate('folder');
              setDraftName('');
            }}
          >
            <Icon name="new-folder" size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh Explorer"
            title="Refresh Explorer"
            onClick={() => void loadDirectory(rootPath, true)}
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>

      <div className="explorer__tree" role="tree" aria-label="Files">
        {pendingCreate ? (
          <div className="explorer__row explorer__row--draft" style={{ paddingLeft: 8 }}>
            {pendingCreate === 'folder' ? (
              <FolderIcon open={false} size={15} className="explorer__icon explorer__icon--folder" />
            ) : (
              <FileIcon path={draftName || 'untitled'} size={15} className="explorer__icon" />
            )}
            <input
              className="explorer__draft-input"
              autoFocus
              value={draftName}
              placeholder={pendingCreate === 'folder' ? 'Folder name' : 'File name'}
              aria-label={pendingCreate === 'folder' ? 'New folder name' : 'New file name'}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void submitDraft()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitDraft();
                if (event.key === 'Escape') {
                  setPendingCreate(null);
                  setDraftName('');
                }
              }}
            />
          </div>
        ) : null}

        {rootEntries.map((entry) => (
          <TreeRow key={entry.path} entry={entry} depth={0} />
        ))}

        {rootEntries.length === 0 && !pendingCreate ? (
          <p className="sidebar-view__hint">This folder is empty.</p>
        ) : null}
      </div>
    </div>
  );
}
