import { useEffect, useState, type JSX } from 'react';
import { outputChannel, type OutputEntry } from '../../services/output-channel';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

/** Shows the internal log cairn-code produces while it works. */
export function OutputPanel(): JSX.Element {
  const [entries, setEntries] = useState<OutputEntry[]>(() => outputChannel.entries());
  const [channel, setChannel] = useState<string>('all');

  useEffect(() => outputChannel.onDidChange(() => setEntries(outputChannel.entries())), []);

  const channels = [...new Set(entries.map((entry) => entry.channel))].sort();
  const visible = channel === 'all' ? entries : entries.filter((entry) => entry.channel === channel);

  return (
    <div className="output">
      <div className="output__toolbar">
        <select
          className="input input--small"
          aria-label="Output channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="all">All channels</option>
          {channels.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button--small"
          onClick={() => outputChannel.clear(channel === 'all' ? undefined : channel)}
        >
          Clear
        </button>
      </div>

      <div className="output__log" role="log">
        {visible.length === 0 ? (
          <p className="output__empty">Nothing has been logged yet.</p>
        ) : (
          visible.map((entry, index) => (
            <div key={entry.timestamp + '-' + index} className={'output__line output__line--' + entry.level}>
              <span className="output__time">{formatTime(entry.timestamp)}</span>
              <span className="output__channel">[{entry.channel}]</span>
              <span className="output__message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
