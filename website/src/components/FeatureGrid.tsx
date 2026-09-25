import type { JSX } from 'react';
import { FEATURES, type Feature } from '../data/content';
import {
  Lightbulb,
  Terminal,
  Palette,
  Languages,
  Search,
  Command,
  Shield,
  Bolt,
  Branch,
  Bug,
  Puzzle,
  Settings
} from './Icons';
import { Reveal, SpotlightCard } from './Motion';

const ICONS: Record<Feature['icon'], (props: { size?: number }) => JSX.Element> = {
  lightbulb: Lightbulb,
  terminal: Terminal,
  palette: Palette,
  languages: Languages,
  search: Search,
  command: Command,
  shield: Shield,
  bolt: Bolt,
  branch: Branch,
  bug: Bug,
  puzzle: Puzzle,
  settings: Settings
};

export function FeatureGrid(): JSX.Element {
  return (
    <ul className="grid grid--4 feature-grid">
      {FEATURES.map((feature, index) => {
        const Icon = ICONS[feature.icon];
        return (
          // The stagger is capped so the last card in a long grid does not
          // arrive noticeably after the reader has already looked at it.
          <Reveal as="li" key={feature.title} delay={Math.min(index, 4) * 60}>
            <SpotlightCard className="card card--interactive">
              <span className="card__icon">
                <Icon size={19} />
              </span>
              <h3 className="card__title">{feature.title}</h3>
              <p className="card__body">{feature.body}</p>
            </SpotlightCard>
          </Reveal>
        );
      })}
    </ul>
  );
}
