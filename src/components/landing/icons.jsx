import {
  FiCalendar, FiHome, FiShield, FiClock, FiWind, FiTool, FiPackage, FiCheckCircle, FiFileText,
} from 'react-icons/fi';

// The icon names used in config/landingContent.js, in one place. An unknown name draws nothing rather than breaking the page.
const ICONS = {
  calendar: FiCalendar,
  home: FiHome,
  shield: FiShield,
  clock: FiClock,
  sparkle: FiWind,
  wrench: FiTool,
  install: FiPackage,
  check: FiCheckCircle,
  report: FiFileText,
};

function LandingIcon({ name, className }) {
  const Icon = ICONS[name];
  return Icon ? <Icon className={className} aria-hidden="true" focusable="false" /> : null;
}

export default LandingIcon;
