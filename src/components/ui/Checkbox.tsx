import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "../../utils/cn"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onCheckedChange) {
                onCheckedChange(e.target.checked);
            }
            if (onChange) {
                onChange(e);
            }
        };

        return (
            <div className="relative inline-flex items-center justify-center p-0.5">
                <input
                    type="checkbox"
                    className="peer absolute opacity-0 w-full h-full cursor-pointer z-10 p-0 m-0"
                    checked={checked}
                    onChange={handleChange}
                    ref={ref}
                    {...props}
                />
                <div className={cn(
                    "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground flex items-center justify-center bg-background transition-colors",
                    checked ? "bg-primary text-primary-foreground" : "opacity-50",
                    className
                )}>
                    {checked && <Check className="h-3 w-3" />}
                </div>
            </div>
        )
    }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
