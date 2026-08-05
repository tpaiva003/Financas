import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  reminderStatus,
  sortByUrgency,
  type ReminderStatus,
} from "./import-reminders";

const base = {
  source: "bankinter",
  label: "Bankinter (conta)",
  frequency: "monthly" as const,
};

describe("addMonths", () => {
  it("avança um mês", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
  });

  it("não salta o mês quando o dia não existe", () => {
    // 31 de janeiro + 1 mês = 28 de fevereiro, não 3 de março.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("atravessa o ano", () => {
    expect(addMonths("2025-11-30", 3)).toBe("2026-02-28");
  });
});

describe("addDays / daysBetween", () => {
  it("soma dias sobre fronteiras de mês", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("conta dias entre datas", () => {
    expect(daysBetween("2026-08-01", "2026-08-10")).toBe(9);
    expect(daysBetween("2026-08-10", "2026-08-01")).toBe(-9);
  });
});

describe("reminderStatus", () => {
  it("marca como nunca importado quando não há histórico", () => {
    const s = reminderStatus(
      { ...base, lastImportAt: null, lastTransactionDate: null },
      "2026-08-05",
    );
    expect(s.state).toBe("never");
    expect(s.nextDueDate).toBeNull();
    expect(s.fromDate).toBeNull();
  });

  it("sugere importar a partir do dia SEGUINTE à última transação", () => {
    // A regra que protege contra overlap: o dia da última transação já está
    // registado, por isso o próximo ficheiro começa no dia a seguir.
    const s = reminderStatus(
      { ...base, lastImportAt: "2026-07-11T10:00:00Z", lastTransactionDate: "2026-07-10" },
      "2026-08-05",
    );
    expect(s.fromDate).toBe("2026-07-11");
  });

  it("fica atrasado passado o prazo", () => {
    const s = reminderStatus(
      { ...base, lastImportAt: "2026-06-30", lastTransactionDate: "2026-06-28" },
      "2026-08-05",
    );
    expect(s.state).toBe("overdue");
    expect(s.nextDueDate).toBe("2026-07-30");
    expect(s.overdueDays).toBe(6);
    expect(s.message).toContain("6 dias");
  });

  it("avisa quando falta pouco", () => {
    const s = reminderStatus(
      { ...base, lastImportAt: "2026-07-08", lastTransactionDate: "2026-07-07" },
      "2026-08-06",
    );
    expect(s.state).toBe("due");
    expect(s.overdueDays).toBe(0);
  });

  it("fica em dia logo a seguir a importar", () => {
    const s = reminderStatus(
      { ...base, lastImportAt: "2026-08-04", lastTransactionDate: "2026-08-03" },
      "2026-08-05",
    );
    expect(s.state).toBe("ok");
    expect(s.nextDueDate).toBe("2026-09-04");
  });

  it("respeita a periodicidade semanal e trimestral", () => {
    const semanal = reminderStatus(
      { ...base, frequency: "weekly", lastImportAt: "2026-08-01", lastTransactionDate: null },
      "2026-08-05",
    );
    expect(semanal.nextDueDate).toBe("2026-08-08");

    const trimestral = reminderStatus(
      { ...base, frequency: "quarterly", lastImportAt: "2026-05-05", lastTransactionDate: null },
      "2026-08-05",
    );
    expect(trimestral.nextDueDate).toBe("2026-08-05");
    expect(trimestral.state).toBe("due");
  });

  it("ignora a hora do timestamp do lote", () => {
    const s = reminderStatus(
      { ...base, lastImportAt: "2026-08-04T23:30:00.000Z", lastTransactionDate: "2026-08-04" },
      "2026-08-05",
    );
    expect(s.nextDueDate).toBe("2026-09-04");
  });
});

describe("sortByUrgency", () => {
  it("põe os atrasados à frente, o mais atrasado primeiro", () => {
    const mk = (source: string, state: ReminderStatus["state"], overdueDays: number) =>
      ({ ...base, source, state, overdueDays }) as ReminderStatus;
    const sorted = sortByUrgency([
      mk("a", "ok", 0),
      mk("b", "overdue", 2),
      mk("c", "never", 0),
      mk("d", "overdue", 30),
      mk("e", "due", 0),
    ]);
    expect(sorted.map((s) => s.source)).toEqual(["d", "b", "e", "c", "a"]);
  });
});
