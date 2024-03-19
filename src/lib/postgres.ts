import postgres from "postgres";

export const sql = postgres(
    "postgres://docker:docker@localhost:5432/shortlinks"
)