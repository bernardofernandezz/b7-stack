import { Button as BaseButton } from "@base-ui/react/button";
import { Field } from "@base-ui/react/field";
import type { ComponentProps } from "react";

const buttonStyles = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700",
  ghost: "text-zinc-600 hover:bg-zinc-200",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: keyof typeof buttonStyles }) {
  return (
    <BaseButton
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextField({ label, ...props }: { label: string } & ComponentProps<typeof Field.Control>) {
  return (
    <Field.Root className="flex flex-col gap-1">
      <Field.Label className="text-sm font-medium">{label}</Field.Label>
      <Field.Control className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" {...props} />
    </Field.Root>
  );
}
