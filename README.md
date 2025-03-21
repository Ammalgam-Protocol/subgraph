## Ammalgam Subgraph

This repository contains the subgraph code for indexing Ammalgam Protocol events on TheGraph.

### Prerequisites

- Node.js (v22 or later)
- pnpm

### Installation

Install dependencies:
```bash
pnpm install
```

### Development Environment

Generate code from GraphQL schema:
```bash
pnpm run codegen
```

Build the subgraph:
```bash
pnpm run build
```

### Code Formatting and Linting

Lint code:
```bash
pnpm run lint
```

Fix linting issues:
```bash
pnpm run lint:fix
```

Check code formatting:
```bash
pnpm run prettier
```

Format code:
```bash
pnpm run prettier:format
```

### Production Deployment

Deploy to TheGraph Studio:
```bash
pnpm run deploy --network <network>
```
Replace `<network>` with the desired network (e.g., `mainnet`, `sepolia`, etc.).