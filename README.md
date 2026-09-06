# Next.js template

This is a Next.js template with shadcn/ui.

## Mobile app API

The `/api/v1` REST API serves data to the React Native (Expo) app —
see [`docs/mobile-api.md`](docs/mobile-api.md) for authentication and the
endpoint reference.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
