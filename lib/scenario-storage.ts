import { validateScenario, type Scenario } from "./engine";
import { findFactory, isFactoryCompatible } from "./factory-scenario";

export const ACTIVE_FACTORY_KEY = "robospace-fit:active-factory:v1";
export const scenarioStorageKey = (id: string) => `robospace-fit:factory:v1:${id}`;
export type ScenarioDraft = { scenario: Scenario; selected: string; saved: boolean };
type StorageReader = Pick<Storage, "getItem">;

export function readScenario(storage: StorageReader, id: string): ScenarioDraft | undefined {
  try {
    if (!findFactory(id)) return;
    // Keep edits from the original food-only release available after upgrading.
    const raw = storage.getItem(scenarioStorageKey(id)) ??
      (id === "food-packaging-hall-v2" ? storage.getItem("robospace-fit:scenario:v2") : null);
    if (!raw) return;
    const data = JSON.parse(raw);
    const parsed = validateScenario(data);
    if (!parsed.valid || parsed.scenario.id !== id || !isFactoryCompatible(parsed.scenario)) return;
    return {
      scenario: parsed.scenario,
      selected: parsed.scenario.candidates.some((c) => c.id === data.selectedCandidateId)
        ? data.selectedCandidateId : parsed.scenario.candidates[0].id,
      saved: true,
    };
  } catch { return; }
}
