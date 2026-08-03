import { z } from "zod";
import type { ModuleKind } from "@/lib/types";

type Path = (string | number)[];

function read(root: Record<string, unknown>, path: Path): unknown {
  let value: unknown = root;
  for (const key of path) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}

// Adds the semantic constraints a primitive zod shape cannot express cleanly:
// useful text rather than whitespace, realistic live-session bounds, unique
// choices, and relationships such as max > min. Runtime action handlers still
// validate untrusted actions separately; this protects saved designs/templates.
export function qualitySchema<T>(
  id: ModuleKind,
  schema: z.ZodType<T>,
): z.ZodType<T> {
  return schema.superRefine((value, ctx) => {
    const config = value as Record<string, unknown>;
    const issue = (path: Path, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const text = (
      path: Path,
      options: { required?: boolean; max?: number } = {},
    ) => {
      const valueAtPath = read(config, path);
      if (valueAtPath == null) return;
      if (typeof valueAtPath !== "string") return;
      if (options.required && !valueAtPath.trim())
        issue(path, "Write something the room can act on.");
      if (valueAtPath.length > (options.max ?? 2000))
        issue(path, `Keep this under ${options.max ?? 2000} characters.`);
    };
    const number = (path: Path, min: number, max: number, integer = true) => {
      const valueAtPath = read(config, path);
      if (valueAtPath == null || typeof valueAtPath !== "number") return;
      if (!Number.isFinite(valueAtPath)) issue(path, "Use a finite number.");
      else if (valueAtPath < min || valueAtPath > max)
        issue(path, `Use a value from ${min} to ${max}.`);
      else if (integer && !Number.isInteger(valueAtPath))
        issue(path, "Use a whole number.");
    };
    const textList = (path: Path, min: number, max: number, unique = true) => {
      const valueAtPath = read(config, path);
      if (!Array.isArray(valueAtPath)) return;
      if (valueAtPath.length < min || valueAtPath.length > max)
        issue(path, `Use ${min === max ? min : `${min}–${max}`} items.`);
      const cleaned = valueAtPath
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim());
      const blank = cleaned.findIndex((item) => !item);
      if (blank !== -1)
        issue([...path, blank], "Remove the blank item or write a label.");
      if (unique) {
        const seen = new Set<string>();
        cleaned.forEach((item, index) => {
          const key = item.toLocaleLowerCase();
          if (key && seen.has(key))
            issue([...path, index], "Each item must be distinct.");
          seen.add(key);
        });
      }
    };

    text(["label"], { required: true, max: 120 });

    switch (id) {
      case "lobby":
        text(["message"], { max: 500 });
        break;
      case "content":
        text(["contentHeading"], { max: 200 });
        break;
      case "media": {
        const cards = config.cards;
        if (Array.isArray(cards) && cards.length > 300)
          issue(["cards"], "Use no more than 300 presentation cards.");
        break;
      }
      case "ambient":
        text(["note"], { max: 500 });
        break;
      case "capture":
        text(["prompt"], { required: true, max: 2000 });
        text(["prompt2"], { max: 2000 });
        text(["placeholder"], { max: 200 });
        text(["placeholder2"], { max: 200 });
        number(["timerSeconds"], 30, 14_400);
        textList(["constraintDeck"], 1, 20, false);
        break;
      case "allocate": {
        text(["allocate", "header"], { required: true, max: 500 });
        number(["allocate", "cap"], 1, 500);
        const fixed = read(config, ["allocate", "fixedOptions"]);
        const fromContent = read(config, [
          "allocate",
          "optionsFromContentType",
        ]);
        if (fixed !== undefined) textList(["allocate", "fixedOptions"], 2, 30);
        if (fixed !== undefined && fromContent !== undefined)
          issue(
            ["allocate"],
            "Choose fixed choices or choices from content—not both.",
          );
        if (fixed === undefined && fromContent === undefined)
          issue(["allocate"], "Add fixed choices or choose a content source.");
        break;
      }
      case "coordinator":
        text(["coordinator", "message"], { required: true, max: 500 });
        break;
      case "readaround":
        if (
          read(config, ["readaround", "source"]) === "submissions" &&
          !String(read(config, ["readaround", "sourcePhaseId"]) ?? "").trim()
        )
          issue(
            ["readaround", "sourcePhaseId"],
            "Choose the earlier phase to read from.",
          );
        break;
      case "close":
        text(["message"], { max: 500 });
        text(["nextStep"], { max: 500 });
        break;
      case "poll":
        text(["question"], { required: true, max: 500 });
        textList(["options"], 2, 20);
        break;
      case "dotvote":
        text(["prompt"], { max: 500 });
        textList(["options"], 2, 30);
        number(["dots"], 1, 20);
        break;
      case "rank":
        text(["prompt"], { max: 500 });
        textList(["items"], 2, 12);
        break;
      case "scale": {
        textList(["statements"], 1, 12);
        number(["min"], -1000, 1000, false);
        number(["max"], -1000, 1000, false);
        const min = config.min;
        const max = config.max;
        if (typeof min === "number" && typeof max === "number" && max <= min)
          issue(["max"], "The maximum must be greater than the minimum.");
        textList(["labels"], 2, 2, false);
        break;
      }
      case "wordcloud":
        text(["prompt"], { required: true, max: 500 });
        number(["maxWords"], 1, 10);
        break;
      case "qna":
        text(["prompt"], { max: 500 });
        break;
      case "matrix": {
        text(["prompt"], { max: 500 });
        textList(["xLabel"], 2, 2, false);
        textList(["yLabel"], 2, 2, false);
        const min = config.min;
        const max = config.max;
        if (typeof min === "number" && typeof max === "number" && max <= min)
          issue(["max"], "The maximum must be greater than the minimum.");
        break;
      }
      case "brainwrite":
        text(["prompt"], { required: true, max: 1000 });
        number(["maxLen"], 20, 2000);
        break;
      case "marketplace": {
        text(["prompt"], { required: true, max: 1000 });
        number(["budget"], 1, 10_000);
        number(["maxPerIdea"], 1, 10_000);
        const budget = config.budget;
        const perIdea = config.maxPerIdea;
        if (
          typeof budget === "number" &&
          typeof perIdea === "number" &&
          perIdea > budget
        )
          issue(
            ["maxPerIdea"],
            "The per-idea maximum cannot exceed the budget.",
          );
        text(["currencyLabel"], { required: true, max: 40 });
        break;
      }
      case "redistribute":
        text(["prompt"], { required: true, max: 1000 });
        break;
      case "spectrogram":
        text(["statement"], { required: true, max: 1000 });
        textList(["poleLabels"], 2, 2, false);
        number(["buckets"], 2, 12);
        break;
      case "gradient": {
        text(["proposal"], { required: true, max: 2000 });
        break;
      }
      case "lightning":
        number(["secondsPerSpeaker"], 15, 3600);
        text(["topicPrompt"], { max: 300 });
        break;
      case "fishbowl":
        number(["innerSeats"], 2, 50);
        break;
      case "openspace":
        number(["slots"], 1, 20);
        textList(["spaces"], 1, 30);
        break;
      case "consult":
        text(["prompt"], { required: true, max: 1000 });
        number(["phaseSeconds", "present"], 30, 1800);
        number(["phaseSeconds", "advise"], 30, 3600);
        break;
      case "devil":
        number(["maxObjections"], 1, 10);
        break;
      case "friction":
        number(["topNTensions"], 1, 12);
        break;
      case "synthesis":
        number(["bulletCount"], 1, 12);
        break;
      case "needs":
      case "equity":
      case "issuemap":
        break;
      case "prework":
        text(["prompt"], { required: true, max: 2000 });
        text(["placeholder"], { max: 200 });
        text(["brief"], { required: true, max: 4000 });
        break;
      case "worldcafe":
        text(["prompt"], { required: true, max: 1000 });
        number(["tables"], 1, 50);
        break;
      case "stations":
        textList(["stations"], 1, 30);
        number(["groupSize"], 2, 20);
        text(["prompt"], { required: true, max: 1000 });
        break;
      case "onetwofour":
        text(["prompt"], { required: true, max: 1000 });
        break;
      case "twentyfive10":
        text(["prompt"], { required: true, max: 1000 });
        number(["maxScore"], 2, 10);
        number(["passes"], 1, 10);
        break;
      case "minspecs":
        text(["prompt"], { required: true, max: 1000 });
        break;
      case "persona": {
        const personas = config.personas;
        if (Array.isArray(personas)) {
          if (personas.length < 1 || personas.length > 12)
            issue(["personas"], "Use 1–12 distinct personas.");
          const names = new Set<string>();
          personas.forEach((persona, index) => {
            if (!persona || typeof persona !== "object") return;
            const item = persona as Record<string, unknown>;
            if (!String(item.name ?? "").trim())
              issue(["personas", index, "name"], "Give this persona a name.");
            if (!String(item.description ?? "").trim())
              issue(
                ["personas", index, "description"],
                "Describe this persona's goals, context, and constraints.",
              );
            const key = String(item.name ?? "")
              .trim()
              .toLocaleLowerCase();
            if (key && names.has(key))
              issue(
                ["personas", index, "name"],
                "Persona names must be distinct.",
              );
            names.add(key);
          });
        }
        break;
      }
      case "emptychair":
        text(["persona", "name"], { required: true, max: 120 });
        text(["persona", "description"], { required: true, max: 2000 });
        break;
      case "promptrelay":
        text(["task"], { required: true, max: 2000 });
        textList(["segmentKinds"], 1, 12);
        break;
      case "builder":
        text(["brief"], { required: true, max: 4000 });
        break;
      case "actions":
        text(["prompt"], { required: true, max: 1000 });
        number(["maxLen"], 20, 2000);
        number(["maxItems"], 1, 20);
        break;
    }
  });
}
