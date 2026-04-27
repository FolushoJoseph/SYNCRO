/**
 * Home page — server component.
 *
 * Responsibilities (server only):
 *   - Auth guard: unauthenticated users receive empty initial data; the client
 *     layer (AppClient / useAuth) handles the redirect to /auth/login.
 *   - Initial data fetch: subscriptions, email accounts, and payments are
 *     fetched server-side so the first paint is hydrated.
 *   - No UI logic, no state, no event handlers.
 *
 * All orchestration (view switching, modals, bulk actions, undo/redo, etc.)
 * lives in AppClient → AppContent (client/components/app/app-client.tsx).
 *
 * Data shape: raw DB rows (snake_case) are passed directly as
 * `Subscription[]` from @/lib/supabase/subscriptions — no transformation
 * is performed here. AppClient and its hooks consume that type natively.
 *
 * Deferred fetches (not yet implemented server-side):
 *   - priceChanges          — passed as [] until a dedicated RPC/table is ready
 *   - consolidationSuggestions — passed as [] until a dedicated RPC/table is ready
 */

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppClient } from "@/components/app/app-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

async function getInitialData() {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            // Not authenticated — return empty data; AppClient handles auth redirect.
            return {
                subscriptions: [],
                emailAccounts: [],
                payments: [],
                priceChanges: [],
                consolidationSuggestions: [],
            };
        }

        const [subscriptionsResult, emailAccountsResult, paymentsResult] =
            await Promise.all([
                supabase
                    .from("subscriptions")
                    .select("*")
                    .eq("user_id", user.id)
                    .order("date_added", { ascending: false }),
                supabase
                    .from("email_accounts")
                    .select("*")
                    .eq("user_id", user.id),
                supabase
                    .from("payments")
                    .select("*")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false }),
            ]);

        return {
            subscriptions: subscriptionsResult.data ?? [],
            emailAccounts: emailAccountsResult.data ?? [],
            payments: paymentsResult.data ?? [],
            // Not yet fetched server-side — AppClient derives these client-side.
            priceChanges: [],
            consolidationSuggestions: [],
        };
    } catch (error) {
        console.error("Error fetching initial data:", error);
        return {
            subscriptions: [],
            emailAccounts: [],
            payments: [],
            priceChanges: [],
            consolidationSuggestions: [],
        };
    }
}

export default async function HomePage() {
    const initialData = await getInitialData();

    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#F9F6F2] dark:bg-[#1E2A35] flex items-center justify-center">
                    <LoadingSpinner size="lg" darkMode={false} />
                </div>
            }
        >
            <AppClient
                initialSubscriptions={initialData.subscriptions}
                initialEmailAccounts={initialData.emailAccounts}
                initialPayments={initialData.payments}
                initialPriceChanges={initialData.priceChanges}
                initialConsolidationSuggestions={
                    initialData.consolidationSuggestions
                }
            />
        </Suspense>
    );
}
