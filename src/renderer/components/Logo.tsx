import React from 'react';

interface AnimatedLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  primaryColor?: string;
  title?: string;
}

const AnimatedLogo: React.FC<AnimatedLogoProps> = ({
  size = 64, // Slightly larger default to show off the animation
  primaryColor = "#6355fa",
  title = "Animated Company Logo",
  ...props
}) => {
  const id = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${id}-title`}
      {...props}
    >
      <title id={`${id}-title`}>{title}</title>

      <style>
        {`
          @keyframes breathe {
            0%, 100% { opacity: 0.3; transform: scale(1); transform-origin: center; }
            50% { opacity: 0.5; transform: scale(1.05); transform-origin: center; }
          }
          @keyframes pulse-core {
            0%, 100% { r: 2.5; filter: blur(0px); }
            50% { r: 3; filter: blur(0.5px); }
          }
          .logo-shield {
            animation: breathe 4s ease-in-out infinite;
          }
          .logo-core {
            animation: pulse-core 3s ease-in-out infinite;
          }
        `}
      </style>

      {/* Outer Structure (Static) */}
      <path
        d="M14 2L24 8V20L14 26L4 20V8L14 2Z"
        stroke={primaryColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Inner Shield (Breathing Animation) */}
      <path
        className="logo-shield"
        d="M14 8L20 11.5V18.5L14 22L8 18.5V11.5L14 8Z"
        fill={primaryColor}
        stroke={primaryColor}
        strokeWidth="1"
      />

      {/* Central Core (Pulsing Animation) */}
      <circle
        className="logo-core"
        cx="14"
        cy="15"
        fill={primaryColor}
      />
    </svg>
  );
};

export default AnimatedLogo;
