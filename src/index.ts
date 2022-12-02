import { createCors } from "itty-cors";
import { Router, Request as RouterRequest } from "itty-router";
import validateCaptcha from "./captcha";
import Database from "./database";
import { InternalError } from "./error";

const getRemainingTime = (env: Env) => {
  const endDate = Number(env.VOTING_END_TIMESTAMP);
  return endDate * 1000 - Date.now();
};

const router = Router();

const { corsify, preflight } = createCors({
  methods: ["GET", "POST"],
});

router.all("*", preflight);

router.get("/projects", async (_req, env: Env) => {
  const database = new Database(env.MONGO_BASE_URL, env.MONGO_API_KEY);

  return new Response(JSON.stringify(await database.getProjects()), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=14400, s-maxage=43200",
    },
  });
});

router.get("/projects/vote-count", async (_req, env: Env) => {
  const database = new Database(env.MONGO_BASE_URL, env.MONGO_API_KEY);

  return new Response(JSON.stringify(await database.getVotes()), {
    headers: {
      "Content-Type": "application/json",
    },
  });
});

router.post(
  "/projects/:id/vote",
  async (req: RouterRequest & Request, env: Env, _ctx) => {
    const id = Number(req.params?.id);
    if (!id) {
      throw new InternalError("Invalid project id", 400);
    }

    const { captchaResponse } = await req.json();

    if (!captchaResponse) {
      throw new InternalError("Invalid captcha response", 400);
    }

    if (getRemainingTime(env) <= 0) {
      throw new InternalError("Voting time is over", 408);
    }

    const ip = req.headers.get("CF-Connecting-IP")!;

    const captchaValid = await validateCaptcha(
      env.RECAPTCHA_SECRET,
      captchaResponse,
      ip
    );

    if (!captchaValid) {
      throw new InternalError("Invalid captcha", 422);
    }

    const database = new Database(env.MONGO_BASE_URL, env.MONGO_API_KEY);

    const changed = await database.vote(
      id,
      ip,
      req.headers.get("User-Agent") ?? ""
    );

    if (!changed) {
      throw new InternalError(
        "Could not find project. Nothing has changed.",
        404
      );
    }

    return new Response("", { status: 201 });
  }
);

router.get("/status", (_, env: Env) => {
  const diff = getRemainingTime(env);

  const res =
    diff > 0
      ? {
          status: "OPEN",
          remainingTime: diff,
        }
      : {
          status: "CLOSED",
        };

  return new Response(JSON.stringify(res), {
    headers: {
      "Content-Type": "application/json",
    },
  });
});

router.all("*", () => new Response("404, not found!", { status: 404 }));

const errorHandler = (error: any) => {
  let errorMessage, statusCode;
  if (error instanceof InternalError) {
    errorMessage = error.message;
    statusCode = error.status;
  } else {
    errorMessage = "Ocorreu um erro inesperado.";
  }

  statusCode ??= 500;

  console.log("An error occurred:", error);

  return new Response(
    JSON.stringify({
      error: errorMessage,
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};

export interface Env {
  MONGO_API_KEY: string;
  MONGO_BASE_URL: string;
  RECAPTCHA_SECRET: string;
  VOTING_END_TIMESTAMP: string;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return router
      .handle(request, env, ctx)
      .then(corsify)
      .catch(errorHandler)
      .then((r: Response) => {
        r.headers.set("access-control-allow-origin", "*");
        return r;
      });
  },
};
