import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ShellDescriptor } from '@shared/types';

/**
 * Finds the shells actually installed on this machine.
 *
 * The first entry of the returned list is the preferred default: PowerShell 7
 * over Windows PowerShell on Windows, the login shell from $SHELL elsewhere.
 * Only shells that exist on disk are returned, so the terminal never tries to
 * spawn an executable that is not there.
 */
export function detectShells(): ShellDescriptor[] {
  return process.platform === 'win32' ? detectWindowsShells() : detectUnixShells();
}

function detectWindowsShells(): ShellDescriptor[] {
  const shells: ShellDescriptor[] = [];
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';

  const pwsh = join(programFiles, 'PowerShell', '7', 'pwsh.exe');
  if (existsSync(pwsh)) {
    shells.push({ id: 'pwsh', label: 'PowerShell 7', executable: pwsh, args: ['-NoLogo'] });
  }

  const windowsPowerShell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (existsSync(windowsPowerShell)) {
    shells.push({
      id: 'powershell',
      label: 'Windows PowerShell',
      executable: windowsPowerShell,
      args: ['-NoLogo']
    });
  }

  const gitBash = join(programFiles, 'Git', 'bin', 'bash.exe');
  if (existsSync(gitBash)) {
    shells.push({ id: 'git-bash', label: 'Git Bash', executable: gitBash, args: ['--login', '-i'] });
  }

  const wsl = join(systemRoot, 'System32', 'wsl.exe');
  if (existsSync(wsl)) {
    shells.push({ id: 'wsl', label: 'WSL', executable: wsl, args: [] });
  }

  const cmd = join(systemRoot, 'System32', 'cmd.exe');
  if (existsSync(cmd)) {
    shells.push({ id: 'cmd', label: 'Command Prompt', executable: cmd, args: [] });
  }

  // A Windows install without cmd.exe is not something cairn-code can repair, but
  // returning the bare name still lets PATH resolution have a chance.
  if (shells.length === 0) {
    shells.push({ id: 'cmd', label: 'Command Prompt', executable: 'cmd.exe', args: [] });
  }

  return shells;
}

function detectUnixShells(): ShellDescriptor[] {
  const candidates: Array<{ id: string; label: string; path: string; args: string[] }> = [
    { id: 'zsh', label: 'zsh', path: '/bin/zsh', args: ['-l'] },
    { id: 'zsh-usr', label: 'zsh', path: '/usr/bin/zsh', args: ['-l'] },
    { id: 'bash', label: 'bash', path: '/bin/bash', args: ['-l'] },
    { id: 'bash-usr', label: 'bash', path: '/usr/bin/bash', args: ['-l'] },
    { id: 'fish', label: 'fish', path: '/usr/bin/fish', args: ['-l'] },
    { id: 'sh', label: 'sh', path: '/bin/sh', args: [] }
  ];

  const shells: ShellDescriptor[] = [];
  const seenLabels = new Set<string>();

  const loginShell = process.env.SHELL;
  if (loginShell && existsSync(loginShell)) {
    const label = loginShell.split('/').pop() ?? loginShell;
    shells.push({ id: 'default', label: label + ' (default)', executable: loginShell, args: ['-l'] });
    seenLabels.add(label);
  }

  for (const candidate of candidates) {
    if (seenLabels.has(candidate.label) || !existsSync(candidate.path)) continue;
    seenLabels.add(candidate.label);
    shells.push({
      id: candidate.id,
      label: candidate.label,
      executable: candidate.path,
      args: candidate.args
    });
  }

  if (shells.length === 0) {
    shells.push({ id: 'sh', label: 'sh', executable: '/bin/sh', args: [] });
  }

  return shells;
}
