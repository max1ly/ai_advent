import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'support');

const TAG = '[SupportCRM]';
function log(msg: string) {
  console.error(`${TAG} ${msg}`);
}

interface User {
  id: string;
  name: string;
  email: string;
  plan: string;
  signupDate: string;
  lastLogin: string;
  features: string[];
}

interface TicketMessage {
  from: string;
  text: string;
  timestamp: string;
}

interface Ticket {
  id: string;
  userId: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

let usersCache: User[] | null = null;
let ticketsCache: Ticket[] | null = null;

async function loadUsers(): Promise<User[]> {
  if (usersCache) return usersCache;
  const raw = await readFile(join(DATA_DIR, 'users.json'), 'utf-8');
  usersCache = JSON.parse(raw) as User[];
  log(`Loaded ${usersCache.length} users`);
  return usersCache;
}

async function loadTickets(): Promise<Ticket[]> {
  if (ticketsCache) return ticketsCache;
  const raw = await readFile(join(DATA_DIR, 'tickets.json'), 'utf-8');
  ticketsCache = JSON.parse(raw) as Ticket[];
  log(`Loaded ${ticketsCache.length} tickets`);
  return ticketsCache;
}

const server = new McpServer({
  name: 'Support CRM',
  version: '1.0.0',
});

server.tool(
  'get_user',
  'Get user profile by user ID. Returns name, email, plan, signup date, last login, and enabled features.',
  { userId: z.string().describe('The user ID (e.g. usr_001)') },
  async ({ userId }) => {
    const users = await loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return {
        content: [{ type: 'text' as const, text: `User not found: ${userId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(user, null, 2) }],
    };
  },
);

server.tool(
  'get_tickets',
  'Get all support tickets for a user. Returns ticket summaries: id, subject, status, priority, category, dates.',
  { userId: z.string().describe('The user ID to look up tickets for') },
  async ({ userId }) => {
    const tickets = await loadTickets();
    const userTickets = tickets.filter((t) => t.userId === userId);
    const summaries = userTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      category: t.category,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { userId, ticketCount: summaries.length, tickets: summaries },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'get_ticket_detail',
  'Get full details of a specific support ticket including description and message history.',
  { ticketId: z.string().describe('The ticket ID (e.g. TKT-1001)') },
  async ({ ticketId }) => {
    const tickets = await loadTickets();
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return {
        content: [{ type: 'text' as const, text: `Ticket not found: ${ticketId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(ticket, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('Server started on stdio transport');
}

main().catch((err) => {
  log(`Fatal error: ${err}`);
  process.exit(1);
});
