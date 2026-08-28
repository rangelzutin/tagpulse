import type { FastifyInstance } from "fastify";
import { inspectTagPlusConnection } from "./connection-inspection.js";
import { createTagPlusClient } from "./tagplus-client.js";
import { inspectClientesPagination } from "./inspection/clientes-pagination.js";
import { inspectClientesStructure } from "./inspection/clientes-structural-inspection.js";
import { characterizeClientesFields } from "./inspection/clientes-field-characterization.js";
import { discoverClientesFullStructure } from "./inspection/clientes-full-structure-discovery.js";
import { censusClientesFullStructure } from "./inspection/clientes-full-structural-census.js";
import {
  createAuthorizationUrl,
  createStateStore,
  exchangeAuthorizationCode,
  TagPlusOAuthError,
  type TagPlusOAuthConfig,
  type TagPlusTokens,
} from "./oauth.js";

export interface RegisterTagPlusOAuthOptions {
  config: TagPlusOAuthConfig & { apiVersion: string };
  fetch?: typeof globalThis.fetch;
}

export function registerTagPlusOAuthRoutes(
  app: FastifyInstance,
  options: RegisterTagPlusOAuthOptions,
): void {
  const states = createStateStore();
  let currentTokens: TagPlusTokens | undefined;

  app.get(
    "/integrations/tagplus/inspect-clientes-pagination",
    async (_request, reply) => {
      if (!currentTokens) {
        return reply
          .code(409)
          .send({ status: "error", message: "OAuth authorization required" });
      }
      const client = createTagPlusClient({
        baseUrl: options.config.baseUrl,
        apiVersion: options.config.apiVersion,
        accessToken: currentTokens.accessToken,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      try {
        return await inspectClientesPagination(
          client,
          options.config.apiVersion,
        );
      } catch (error: unknown) {
        _request.log.warn(
          {
            stage: "pagination_inspection",
            category: error instanceof Error ? error.name : "unknown_error",
          },
          "TagPlus pagination inspection stopped",
        );
        return reply
          .code(502)
          .send({ status: "error", message: "Pagination inspection stopped" });
      }
    },
  );

  app.get(
    "/integrations/tagplus/inspect-clientes-full-structure-census",
    async (_request, reply) => {
      if (!currentTokens) {
        return reply
          .code(409)
          .send({ status: "error", message: "OAuth authorization required" });
      }
      const client = createTagPlusClient({
        baseUrl: options.config.baseUrl,
        apiVersion: options.config.apiVersion,
        accessToken: currentTokens.accessToken,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      return censusClientesFullStructure(client, options.config.apiVersion);
    },
  );

  app.get(
    "/integrations/tagplus/inspect-clientes-full-structure",
    async (_request, reply) => {
      if (!currentTokens) {
        return reply
          .code(409)
          .send({ status: "error", message: "OAuth authorization required" });
      }
      const client = createTagPlusClient({
        baseUrl: options.config.baseUrl,
        apiVersion: options.config.apiVersion,
        accessToken: currentTokens.accessToken,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      return discoverClientesFullStructure(client, options.config.apiVersion);
    },
  );

  app.get(
    "/integrations/tagplus/inspect-clientes-fields",
    async (_request, reply) => {
      if (!currentTokens) {
        return reply
          .code(409)
          .send({ status: "error", message: "OAuth authorization required" });
      }
      const client = createTagPlusClient({
        baseUrl: options.config.baseUrl,
        apiVersion: options.config.apiVersion,
        accessToken: currentTokens.accessToken,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      return characterizeClientesFields(client, options.config.apiVersion);
    },
  );

  app.get(
    "/integrations/tagplus/inspect-clientes-structure",
    async (_request, reply) => {
      if (!currentTokens) {
        return reply
          .code(409)
          .send({ status: "error", message: "OAuth authorization required" });
      }
      const client = createTagPlusClient({
        baseUrl: options.config.baseUrl,
        apiVersion: options.config.apiVersion,
        accessToken: currentTokens.accessToken,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      return inspectClientesStructure(client, options.config.apiVersion);
    },
  );

  app.get("/integrations/tagplus/authorize", async (_request, reply) => {
    const state = states.issue();
    return reply.redirect(
      createAuthorizationUrl(options.config, state).toString(),
    );
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/integrations/tagplus/callback",
    async (request, reply) => {
      const { code, state } = request.query;
      if (!code) {
        request.log.warn(
          { stage: "callback_validation", category: "missing_code" },
          "TagPlus OAuth callback rejected",
        );
        return reply
          .code(400)
          .send({ status: "error", message: "Missing authorization code" });
      }
      if (!state || !states.consume(state)) {
        request.log.warn(
          { stage: "state_validation", category: "invalid_or_expired_state" },
          "TagPlus OAuth callback rejected",
        );
        return reply
          .code(400)
          .send({ status: "error", message: "Invalid or expired OAuth state" });
      }

      try {
        currentTokens = await exchangeAuthorizationCode(options.config, code, {
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        const client = createTagPlusClient({
          baseUrl: options.config.baseUrl,
          apiVersion: options.config.apiVersion,
          accessToken: currentTokens.accessToken,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        const validation = await inspectTagPlusConnection({
          company: {
            companyId: "oauth-validation",
            companySlug: "oauth-validation",
          },
          client,
          apiVersion: options.config.apiVersion,
        });
        return {
          status: "authorized",
          accessTokenReceived: true,
          refreshTokenReceived: Boolean(currentTokens.refreshToken),
          ...(currentTokens.expiresIn !== undefined
            ? { expiresIn: currentTokens.expiresIn }
            : {}),
          ...(currentTokens.scope ? { scope: currentTokens.scope } : {}),
          validation: {
            endpoint: validation.endpoint,
            httpStatus: validation.httpStatus,
            durationMs: validation.durationMs,
            rootType: validation.rootType,
            itemCount: validation.itemCount,
          },
        };
      } catch (error: unknown) {
        if (error instanceof TagPlusOAuthError) {
          request.log.warn(error.evidence, "TagPlus OAuth callback failed");
        } else {
          request.log.warn(
            {
              stage: "customer_validation",
              category: error instanceof Error ? error.name : "unknown_error",
            },
            "TagPlus OAuth callback failed",
          );
        }
        return reply.code(502).send({
          status: "error",
          message: "TagPlus authorization could not be completed",
        });
      }
    },
  );
}
