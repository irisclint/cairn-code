import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  getLanguageById,
  getFileIcon,
  LANGUAGES,
  LANGUAGE_COUNT,
  PLAIN_TEXT
} from '@renderer/editor/language-support';

describe('language table', () => {
  it('should cover at least the fifty languages the product promises', () => {
    expect(LANGUAGE_COUNT).toBeGreaterThanOrEqual(50);
  });

  it('should give every language a unique id', () => {
    const ids = LANGUAGES.map((language) => language.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should give every language at least one extension and an icon', () => {
    for (const language of LANGUAGES) {
      expect(language.extensions.length, language.id).toBeGreaterThan(0);
      expect(language.icon.length, language.id).toBeGreaterThan(0);
      expect(language.label.length, language.id).toBeGreaterThan(0);
    }
  });

  it('should resolve a language by its id', () => {
    expect(getLanguageById('typescript')?.label).toBe('TypeScript');
    expect(getLanguageById('not-a-language')).toBeUndefined();
  });
});

describe('detectLanguage', () => {
  it.each([
    ['app.ts', 'typescript'],
    ['App.tsx', 'typescriptreact'],
    ['script.js', 'javascript'],
    ['Component.jsx', 'javascriptreact'],
    ['main.py', 'python'],
    ['main.rs', 'rust'],
    ['main.go', 'go'],
    ['Main.java', 'java'],
    ['index.html', 'html'],
    ['styles.scss', 'scss'],
    ['data.json', 'json'],
    ['config.yaml', 'yaml'],
    ['README.md', 'markdown'],
    ['query.sql', 'sql'],
    ['deploy.sh', 'shell'],
    ['script.ps1', 'powershell']
  ])('should detect %s as %s', (fileName, expected) => {
    expect(detectLanguage(fileName).id).toBe(expected);
  });

  it('should be case insensitive about the extension', () => {
    expect(detectLanguage('Main.PY').id).toBe('python');
  });

  it('should detect a full path, not only a bare file name', () => {
    expect(detectLanguage('/home/user/project/src/index.ts').id).toBe('typescript');
    expect(detectLanguage('C:\\Users\\dev\\src\\index.ts').id).toBe('typescript');
  });

  it.each([
    ['Dockerfile', 'dockerfile'],
    ['Makefile', 'makefile'],
    ['CMakeLists.txt', 'cmake'],
    ['Gemfile', 'ruby'],
    ['.gitignore', 'git'],
    ['.env', 'env'],
    ['.bashrc', 'shell']
  ])('should detect the extensionless file %s as %s', (fileName, expected) => {
    expect(detectLanguage(fileName).id).toBe(expected);
  });

  it('should prefer an exact file name over an extension match', () => {
    // Without the file name rule this would be detected as the "local" extension.
    expect(detectLanguage('.env.local').id).toBe('env');
  });

  it('should fall back to the shebang interpreter', () => {
    expect(detectLanguage('run', '#!/usr/bin/env python3').id).toBe('python');
    expect(detectLanguage('run', '#!/bin/bash').id).toBe('shell');
    expect(detectLanguage('run', '#!/usr/bin/perl').id).toBe('perl');
  });

  it('should ignore a shebang when the extension already decided', () => {
    expect(detectLanguage('script.py', '#!/bin/bash').id).toBe('python');
  });

  it('should fall back to plain text for an unknown file', () => {
    expect(detectLanguage('mystery.qqq').id).toBe(PLAIN_TEXT.id);
    expect(detectLanguage('noextension').id).toBe(PLAIN_TEXT.id);
  });

  it('should provide comment tokens for languages that have them', () => {
    expect(detectLanguage('a.ts').lineComment).toBe('//');
    expect(detectLanguage('a.py').lineComment).toBe('#');
    expect(detectLanguage('a.lua').lineComment).toBe('--');
    expect(detectLanguage('a.ts').blockComment).toEqual(['/*', '*/']);
  });
});

describe('getFileIcon', () => {
  it('should return the icon key of the detected language', () => {
    expect(getFileIcon('app.ts')).toBe('ts');
    expect(getFileIcon('main.py')).toBe('py');
    expect(getFileIcon('Dockerfile')).toBe('docker');
  });
});
