import { Text } from "@react-three/drei";
import { GradientBackground, RoundedPlane } from "./common/PanelElements";
import { useState } from "react";
import { useCursor } from "@react-three/drei";

interface SidebarItemData {
  id: string;
  icon: string;
  label: string;
  color: string;
  description: string;
  conditional?: boolean;
}

const baseSidebarItems: SidebarItemData[] = [
  {
    id: "movement",
    icon: "✥",
    label: "Movement",
    color: "#10B981",
    description: "Navigation controls",
  },
  {
    id: "rotation",
    icon: "⟲",
    label: "Rotation",
    color: "#3B82F6",
    description: "Rotate furniture",
  },
  {
    id: "scale",
    icon: "⬚",
    label: "Scale",
    color: "#EC4899",
    description: "Resize objects",
  },
  {
    id: "settings",
    icon: "⚙",
    label: "Settings",
    color: "#8B5CF6",
    description: "Scene settings",
  },
  {
    id: "customize",
    icon: "✎",
    label: "Customize",
    color: "#F59E0B",
    description: "Personalize scene",
  },
];

const SIDEBAR_WIDTH = 0.25;
const SIDEBAR_CENTER_X = SIDEBAR_WIDTH / 10;

interface SidebarItemProps {
  item: SidebarItemData;
  yPos: number;
  isActive: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  isHovered: boolean;
}

function SidebarItem({ item, yPos, isActive, onHover, onClick, isHovered }: SidebarItemProps) {
  useCursor(isHovered, "pointer");

  return (
    <group position={[SIDEBAR_CENTER_X, yPos, 0]}>
      {/* Item Button */}
      <group
        onPointerEnter={(e) => {
          e.stopPropagation();
          onHover(item.id);
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick(item.id);
        }}
      >
        <mesh>
          <RoundedPlane width={0.12} height={0.12} radius={0.02} />
          <meshStandardMaterial
            color={
              isActive
                ? item.color
                : isHovered
                  ? "#334155"
                  : "#1E293B"
            }
            emissive={isHovered ? item.color : "#000000"}
            emissiveIntensity={isHovered ? 0.3 : 0}
          />
        </mesh>

        {/* Icon */}
        <Text
          position={[0.01, 0, 0.01]}
          fontSize={0.06}
          color={isActive || isHovered ? "#000000" : "#94A3B8"}
          anchorX="center"
          anchorY="middle"
        >
          {item.icon}
        </Text>

        {/* Active Indicator */}
        {isActive && (
          <mesh position={[0.07, 0, 0.01]}>
            <planeGeometry args={[0.01, 0.12]} />
            <meshBasicMaterial color={item.color} />
          </mesh>
        )}
      </group>

      {/* Tooltip on Hover */}
      {isHovered && (
        <group position={[0.15, 0, 0]}>
          <mesh>
            <planeGeometry args={[0.2, 0.06]} />
            <meshBasicMaterial color="#334155" opacity={0.95} transparent />
          </mesh>
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.025}
            color="#FFFFFF"
            anchorX="center"
            anchorY="middle"
          >
            {item.label}
          </Text>
        </group>
      )}
    </group>
  );
}

interface VRSidebarProps {
  show: boolean;
  onItemSelect: (itemId: string) => void;
  showWallToggle?: boolean;
  isOnWall?: boolean;
  onWallToggle?: () => void;
}

export function VRSidebar({
  show,
  onItemSelect,
  showWallToggle = false,
  isOnWall = false,
  onWallToggle,
}: VRSidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);

  if (!show) return null;

  const sidebarItems: SidebarItemData[] = [...baseSidebarItems];
  
  if (showWallToggle) {
    const movementIndex = sidebarItems.findIndex(item => item.id === 'movement');
    sidebarItems.splice(movementIndex + 1, 0, {
      id: "wallToggle",
      icon: isOnWall ? "📌" : "🧱",
      label: isOnWall ? "Move to Floor" : "Mount on Wall",
      color: isOnWall ? "#EF4444" : "#06B6D4",
      description: isOnWall ? "Place on floor" : "Mount on wall",
      conditional: true,
    });
  }

  const handleItemClick = (itemId: string) => {
    if (itemId === 'wallToggle') {
      onWallToggle?.();
      return;
    }
    setActiveItem(itemId);
    onItemSelect(itemId);
  };

  const sidebarHeight = 0.25 + sidebarItems.length * 0.25;

  return (
    <group position={[-0.8, 0, 0]}>
      {/* Sidebar Background */}
      <mesh position={[0, 0, -0.01]}>
        <GradientBackground
          width={SIDEBAR_WIDTH}
          height={sidebarHeight}
          radius={0.02}
          color1="#1E293B"
          color2="#0F172A"
          opacity={0.85}
        />
      </mesh>

      {/* Sidebar Items */}
      {sidebarItems.map((item, index) => (
        <SidebarItem
          key={item.id}
          item={item}
          yPos={0.5 - index * 0.25}
          isActive={activeItem === item.id}
          isHovered={hoveredItem === item.id}
          onHover={setHoveredItem}
          onClick={handleItemClick}
        />
      ))}

      {/* Divider lines between items */}
      {sidebarItems.map((_, index) => {
        if (index === sidebarItems.length - 1) return null;
        const yPos = 0.5 - index * 0.25 - 0.125;
        return (
          <mesh key={`divider-${index}`} position={[SIDEBAR_CENTER_X, yPos, 0]}>
            <planeGeometry args={[0.1, 0.002]} />
            <meshBasicMaterial color="#334155" opacity={0.5} transparent />
          </mesh>
        );
      })}
    </group>
  );
}
