import { Wallet } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { cn } from "@/utils/cn";

interface ConnectWalletButtonProps {
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  idleLabel?: string;
  connectingLabel?: string;
  showIcon?: boolean;
}

export function ConnectWalletButton({
  size = "default",
  variant = "default",
  className,
  idleLabel = "Connect Wallet",
  connectingLabel = "Connecting…",
  showIcon = true,
}: ConnectWalletButtonProps) {
  const { connectAndLogin, connecting } = useWalletAuth();

  return (
    <Button
      size={size}
      variant={variant}
      className={cn(className)}
      disabled={connecting}
      onClick={() => void connectAndLogin()}
    >
      {showIcon && <Wallet />}
      {connecting ? connectingLabel : idleLabel}
    </Button>
  );
}
