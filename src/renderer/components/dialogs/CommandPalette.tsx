import { useMemo, useState, type JSX } from 'react';
import { QuickPickDialog, type QuickPickItem } from './QuickPickDialog';
import { commandService } from '../../services/command-service';
import { formatKeybinding } from '../../services/keyboard-service';
import { useUiStore } from '../../store/ui-store';

/** Fuzzy searchable list of every available command. */
export function CommandPalette(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const initialQuery = useUiStore((state) => state.dialogQuery);
  const [query, setQuery] = useState(initialQuery);

  const items: QuickPickItem[] = useMemo(() => {
    return commandService.search(query).map((match) => {
      const label = match.command.category + ': ' + match.command.title;
      return {
        id: match.command.id,
        label,
        matchIndices: match.indices,
        trailing: match.command.keybinding ? formatKeybinding(match.command.keybinding) : undefined
      };
    });
  }, [query]);

  return (
    <QuickPickDialog
      title="Command Palette"
      placeholder="Type a command name"
      query={query}
      onQueryChange={setQuery}
      items={items}
      emptyMessage="No command matches this search"
      onAccept={(item) => {
        closeDialog();
        void commandService.execute(item.id);
      }}
      onClose={closeDialog}
    />
  );
}
