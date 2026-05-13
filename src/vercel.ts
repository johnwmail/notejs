import { handleRequest } from "./handler";
import { VercelKVStorage } from "./lib/storage";

export const config = {
  runtime: "edge",
};

export default function handler(request: Request): Promise<Response> {
  const storage = new VercelKVStorage();
  return handleRequest(request, storage);
}
