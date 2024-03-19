import fastify from "Fastify";
import { z } from "zod";
import { sql } from "./lib/postgres";
import postgres from "postgres";
import { redis } from "./lib/redis";

const app = fastify();

const API_VERSION = "/api/v1";

app.get(`${API_VERSION}/metrics`, async (request, reply) => {
    try {
        const result = await redis.zRangeByScoreWithScores("metrics", 0, 50);

        console.log(result);

        const metrics = result.sort((a, b) => b.score - a.score).map((item) => ({
            shortLinkId: Number(item.value),
            clicks: item.score,
        }));

        return metrics;
    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            message: "Internal server error",
        });
    }
})

app.get("/:code", async (request, reply) => {
    const getLinkSchema = z.object({
        code: z.string().min(3),
    })

    const { code } = getLinkSchema.parse(request.params);

    try {
        const result = await sql/*sql*/`
            SELECT id, original_url FROM short_links
            WHERE short_links.code = ${code}
        `;

        if (result.length === 0) {
            return reply.code(404).send({
                message: "Not found",
            });
        }

        const link = result[0];

        // 301 - Moved Permanently
        // 302 - Temporary Redirect

        await redis.zIncrBy("metrics", 1, String(link.id));

        return reply.redirect(301, link.original_url);

    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            message: "Internal server error",
        });
    }
})

app.get(`${API_VERSION}/links`, async (request, reply) => {
    const result = await sql/*sql*/`
        SELECT * FROM short_links
        ORDER BY created_at DESC
    `;

    return reply.send(result);
})

app.post(`${API_VERSION}/links`, async (request, reply) => {
    const createLinksSchema = z.object({
        code: z.string().min(3),
        url: z.string().url(),
    });

    try {
        const { code, url } = createLinksSchema.parse(request.body);

        const result = await sql/*sql*/`
            INSERT INTO short_links (code, original_url)
            VALUES (${code}, ${url})
            RETURNING id
        `;

        const link = result[0];

        return reply.code(201).send({
            shortLinkId: link.id,
        });
    } catch (error) {
        if (error instanceof postgres.PostgresError) {
            if (error.code === "23505") {
                return reply.code(400).send({
                    message: "Duplicated code",
                });
            }
        }

        console.error(error);

        return reply.code(500).send({
            message: "Internal server error",
        });
    }
})

app.listen({ port: 3000 }).then(() => {
    console.log("Server is running on port 3000");
});
