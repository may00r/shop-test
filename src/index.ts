import fastify, { FastifyRequest, FastifyReply } from "fastify";
import postgres from "postgres";
import Redis from "ioredis";
import bcrypt from "bcrypt";
import crypto from "crypto";
import dotenv from "dotenv";

interface IRegisterBody {
  username: string;
  password: string;
}

interface ILoginBody {
  username: string;
  password: string;
}

interface IChangePasswordBody {
  username: string;
  old_password: string;
  new_password: string;
}

interface IPurchaseBody {
  product_id: number;
  token_username: string;
}

interface IUser {
  id: number;
  username: string;
  password_hash: string;
  balance: number;
}

interface IProduct {
  id: number;
  name: string;
  price: number;
}

interface IItem {
  market_hash_name: string;
  currency: string;
  suggested_price: number;
  item_page: string;
  market_page: string;
  min_price: number;
  max_price: number;
  mean_price: number;
  median_price: number;
  quantity: number;
  created_at: number;
  updated_at: number;
}

interface IItemResult {
  name: string;
  tradable_min_price: number | null;
  non_tradable_min_price: number | null;
}

dotenv.config();

const server = fastify();
const sql = postgres(
  process.env.DATABASE_URL ||
    "postgres://user:password@localhost:5432/shop_database",
);
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const port = process.env.PORT || 8080;

const REGISTER_SCHEMA = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", minLength: 3, maxLength: 255 },
      password: { type: "string", minLength: 6 },
    },
  },
};

const LOGIN_SCHEMA = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string" },
      password: { type: "string" },
    },
  },
};

const CHANGE_PASSWORD_SCHEMA = {
  body: {
    type: "object",
    required: ["username", "old_password", "new_password"],
    properties: {
      username: { type: "string" },
      old_password: { type: "string" },
      new_password: { type: "string", minLength: 6 },
    },
  },
};

const PURCHASE_SCHEMA = {
  body: {
    type: "object",
    required: ["product_id"],
    properties: {
      product_id: { type: "number" },
    },
  },
};

const generateToken = () => crypto.randomBytes(32).toString("hex");

const setToken = async (username: string) => {
  const existing_token: string = await redis.get(`auth:user:${username}`);
  if (existing_token) {
    await redis.del(`auth:token:${existing_token}`);
  }

  const token = generateToken();

  await redis.set(`auth:token:${token}`, username, "EX", 30 * 60);
  await redis.set(`auth:user:${username}`, token, "EX", 30 * 60);

  return token;
};

const getItemsData = async (tradable = 1): Promise<Array<IItem>> => {
  return (
    (await (
      await fetch(
        `https://api.skinport.com/v1/items?app_id=730&currency=EUR&tradable=${tradable}`,
        {
          method: "GET",
          headers: {
            "Accept-Encoding": "br",
          },
        },
      )
    ).json()) || []
  );
};

server.addHook(
  "preHandler",
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (
      req.routeOptions.url === "/login" ||
      req.routeOptions.url === "/register"
    ) {
      return;
    }

    const auth_header = req.headers.authorization;
    if (!auth_header) {
      return reply.status(401).send({ error: "Unauthorized: Missing token" });
    }

    const token = auth_header.split(" ")[1];
    const username = await redis.get(`auth:token:${token}`);

    if (!username) {
      return reply.status(401).send({ error: "Unauthorized: Invalid token" });
    }

    if (req.body) {
      req.body = { ...req.body, token_user: username };
    }

    return;
  },
);

server.post(
  "/register",
  { schema: REGISTER_SCHEMA },
  async (req: FastifyRequest<{ Body: IRegisterBody }>, reply: FastifyReply) => {
    const { username, password } = req.body;

    const password_hash = await bcrypt.hash(password, 10);

    try {
      await sql`INSERT INTO users (username, password_hash) VALUES (${username}, ${password_hash})`;

      const token = await setToken(username);

      return reply.send({ message: "User registered successfully", token });
    } catch (error) {
      console.error(error);

      return reply.status(400).send({ error: "Username already exists" });
    }
  },
);

server.post(
  "/login",
  { schema: LOGIN_SCHEMA },
  async (req: FastifyRequest<{ Body: ILoginBody }>, reply: FastifyReply) => {
    const { username, password } = req.body;

    const user = await sql<
      IUser[]
    >`SELECT * FROM users WHERE username = ${username}`;

    if (
      user.length === 0 ||
      !(await bcrypt.compare(password, user[0].password_hash))
    ) {
      return reply.status(401).send({ error: "Invalid username or password" });
    }

    const token = await setToken(username);

    return reply.send({ message: "Login successful", token });
  },
);

server.post(
  "/change-password",
  { schema: CHANGE_PASSWORD_SCHEMA },
  async (
    req: FastifyRequest<{ Body: IChangePasswordBody }>,
    reply: FastifyReply,
  ) => {
    const { username, old_password, new_password } = req.body;

    const user = await sql<
      IUser[]
    >`SELECT * FROM users WHERE username = ${username}`;

    if (
      user.length === 0 ||
      !(await bcrypt.compare(old_password, user[0].password_hash))
    ) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const new_password_hash = await bcrypt.hash(new_password, 10);

    await sql`UPDATE users SET password_hash = ${new_password_hash} WHERE username = ${username}`;

    return reply.send({ message: "Password updated successfully" });
  },
);

server.get("/prices", async (req: FastifyRequest, reply: FastifyReply) => {
  const prices = await redis.get("prices");

  if (prices) {
    return reply.send(JSON.parse(prices));
  }

  const tradable_data = await getItemsData();
  const non_tradable_data = await getItemsData(0);

  let result: IItemResult[] = [];

  if (tradable_data?.length && non_tradable_data?.length) {
    const non_tradable_map = new Map(
      non_tradable_data.map((item: IItem) => [
        item.market_hash_name,
        item.min_price,
      ]),
    );

    result = tradable_data.reduce((acc: IItemResult[], item: IItem) => {
      acc.push({
        name: item.market_hash_name,
        tradable_min_price: item.min_price || null,
        non_tradable_min_price:
          non_tradable_map.get(item.market_hash_name) || null,
      });
      return acc;
    }, []);

    await redis.set("prices", JSON.stringify(result), "EX", 60 * 60);
  }

  return reply.send(result);
});

server.post(
  "/purchase",
  { schema: PURCHASE_SCHEMA },
  async (req: FastifyRequest<{ Body: IPurchaseBody }>, reply: FastifyReply) => {
    const { product_id, token_user } = req.body;

    const user = await sql<
      IUser[]
    >`SELECT * FROM users WHERE username = ${token_user}`;

    const product = await sql<
      IProduct[]
    >`SELECT * FROM products WHERE id = ${product_id}`;

    if (!user.length || !product.length) {
      return reply.status(400).send({ error: "Invalid user or product" });
    }

    if (user[0].balance < product[0].price) {
      return reply.status(400).send({ error: "Insufficient balance" });
    }

    const balance = user[0].balance - product[0].price;

    await sql.begin(async (tx) => {
      await tx`UPDATE users SET balance = ${balance} WHERE id = ${user[0].id}`;
      await tx`INSERT INTO purchases (user_id, product_id) VALUES (${user[0].id}, ${product_id})`;
    });

    return reply.send({ balance });
  },
);

server.listen({ port }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`Server running at ${address}`);
});
