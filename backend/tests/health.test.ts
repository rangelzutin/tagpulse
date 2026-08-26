import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("health endpoints", () => {
  it("returns application health without checking the database", async () => {
    const check = vi.fn<() => Promise<void>>();
    const app = await buildApp({
      databaseHealth: { check },
      frontendUrl: "http://localhost:5173",
      logger: false,
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(check).not.toHaveBeenCalled();
  });

  it("reports a connected database", async () => {
    const check = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = await buildApp({
      databaseHealth: { check },
      frontendUrl: "http://localhost:5173",
      logger: false,
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health/database",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "connected" });
    expect(check).toHaveBeenCalledOnce();
  });

  it("returns a safe response when the database is unavailable", async () => {
    const app = await buildApp({
      databaseHealth: {
        check: vi.fn().mockRejectedValue(new Error("connection details")),
      },
      frontendUrl: "http://localhost:5173",
      logger: false,
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health/database",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "error",
      database: "unavailable",
    });
    expect(response.body).not.toContain("connection details");
  });
});
