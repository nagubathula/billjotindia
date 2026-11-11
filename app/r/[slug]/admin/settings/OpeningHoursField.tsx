"use client";

// Weekly opening hours editor. Lives inside the outlet form and hands its
// value over as JSON in a hidden `opening_hours` input (blank = not set).

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DAYS,
  DAY_LABEL,
  parseOpeningHours,
  type DayKey,
  type OpeningHours,
} from "@/lib/opening-hours";

const MAX_SLOTS = 3;

function defaultHours(): OpeningHours {
  const out = {} as OpeningHours;
  for (const d of DAYS) out[d] = [{ open: "09:00", close: "22:00" }];
  return out;
}

export function OpeningHoursField({ initial }: { initial: unknown }) {
  const saved = parseOpeningHours(initial);
  const [enabled, setEnabled] = useState(saved !== null);
  const [hours, setHours] = useState<OpeningHours>(saved ?? defaultHours());

  const setDay = (day: DayKey, slots: OpeningHours[DayKey]) =>
    setHours((prev) => ({ ...prev, [day]: slots }));

  const copyMondayToAll = () =>
    setHours((prev) => {
      const next = {} as OpeningHours;
      for (const d of DAYS) next[d] = prev.mon.map((s) => ({ ...s }));
      return next;
    });

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="opening_hours"
        value={enabled ? JSON.stringify(hours) : ""}
      />

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        This outlet keeps fixed opening hours
      </label>

      {enabled && (
        <>
          <div className="divide-y rounded-lg border">
            {DAYS.map((day) => {
              const slots = hours[day];
              return (
                <div
                  key={day}
                  className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5"
                >
                  <div className="w-24 pt-1.5 text-sm font-medium">{DAY_LABEL[day]}</div>
                  <div className="flex flex-1 flex-col gap-2">
                    {slots.length === 0 && (
                      <span className="pt-1.5 text-sm text-muted-foreground">Closed</span>
                    )}
                    {slots.map((slot, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${DAY_LABEL[day]} opens`}
                          value={slot.open}
                          required
                          onChange={(e) =>
                            setDay(
                              day,
                              slots.map((s, j) =>
                                j === i ? { ...s, open: e.target.value } : s,
                              ),
                            )
                          }
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                          type="time"
                          aria-label={`${DAY_LABEL[day]} closes`}
                          value={slot.close}
                          required
                          onChange={(e) =>
                            setDay(
                              day,
                              slots.map((s, j) =>
                                j === i ? { ...s, close: e.target.value } : s,
                              ),
                            )
                          }
                          className="w-32"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${DAY_LABEL[day]} hours`}
                          onClick={() => setDay(day, slots.filter((_, j) => j !== i))}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {slots.length < MAX_SLOTS && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDay(day, [...slots, { open: "09:00", close: "22:00" }])
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {slots.length === 0 ? "Open" : "Add hours"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              A closing time earlier than the opening time runs past midnight.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={copyMondayToAll}>
              Copy Monday to every day
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
