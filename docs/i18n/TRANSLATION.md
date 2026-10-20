# Turkish translation worksheet

967 unique strings (~5,200 words) extracted from every user-visible surface of apps/web.
Fill the **Türkçe** column; leave `{placeholder}` tokens untouched — they are runtime values.
Groups marked *(cloud-only — skip for the demo)* never render in local mode.

## settings

| English | Türkçe |
|---|---|
| Brand | |
| Brand Settings | |
| Manage your brand name and website. | |
| Loading... | |
| Brand not found | |
| Manage your brand name and website | |
| Brand details updated successfully! | |
| Failed to save the brand. | |
| Enter your brand's name | |
| Brand Slug | |
| Your brand's primary website | |
| Additional Domains | |
| Other domains your brand owns (e.g. blog.example.com, shop.example.com). Citations from these domains will be counted as your brand's citations. Updates retroactively — existing citations will be reclassified immediately. | |
| Add domain... | |
| Brand Aliases | |
| Alternative names for your brand (sub-brands, product lines, abbreviations). Used for mention detection in future prompt runs only — does not apply retroactively to past results. | |
| Add alias... | |
| "{value}" is not a valid domain | |
| Saving... | |
| Save Changes | |
| Competitors | |
| Manage your tracked competitors. | |
| Discovery failed. Check that an LLM API key is configured and try again. | |
| Discover from answers | |
| Scan the AI answers already collected for this brand and suggest the competitors they mention. | |
| Scanning answers… | |
| Discover competitors | |
| No new competitors found in the last {count} answers. | |
| Add | |
| Manage your competitive landscape for reputation tracking. | |
| Warning | |
| Updating competitors will only apply to future prompt evaluations. Citation categorization updates retroactively. | |
| Failed to save competitors. | |
| LLMs | |
| Choose which AI models this brand is tracked against. | |
| Your prompts are evaluated against these AI models to track how your brand appears across different types of AI search. | |
| Tracked platforms | |
| This brand is not tracked on any platform yet. | |
| Could not save platform picks | |
| Estimated provider spend for this brand: {count} tracked prompt{plural} sampled {runsPerDay}×/day across the platforms below. | |
| Your plan tracks up to {limit} platform{plural} for this brand, in any combination below. Changes apply from the next sampling cycle. | |
| {selected} / {limit} picks | |
| Pick at least one platform — a brand with none is not tracked. | |
| That is {count} more than your plan allows. Clear some, or upgrade. | |
| {count} platform{plural} selected | |
| up from | |
| down from | |
| unchanged from | |
| Upgrade to track more platforms | |
| Compare plans | |
| {assigned} / {total} pairings | |
| {remaining} of {total} pairings still available, shared across every brand in this organization. A prompt spends one for each model you track it on. | |
| All {total} pairings are in use. Free one up or buy more to add another. | |
| Choose prompts | |
| Change how many | |
| Track more platforms | |
| Add these to SCRAPE_TARGETS to start tracking them. One account is enough, but which kind you pick changes the data: a scraper reads the product a visitor uses, an API asks the model directly. | |
| Platform | |
| Scrapers | |
| Direct APIs | |
| Provider setup guide | |
| Add, edit, or remove tracked prompts. | |
| Add, edit, or remove your brand tracking keywords and prompts | |
| Organization | |
| The organization's name and URL. | |
| Failed to save the organization. | |
| Organization Slug | |
| Save | |
| API Keys | |
| Issue and revoke API keys for this organization. | |
| Read | |
| Read/Write | |
| Expired {date} | |
| Revoked | |
| Keys authenticate the REST API and MCP connections for this organization. | |
| API access is disabled in demo mode. | |
| Limited Access | |
| Only organization admins can issue or revoke keys. | |
| Add Key | |
| Inactive | |
| Revoked or expired — they no longer authenticate anything. | |
| Create a key | |
| Revoke “{name}”? | |
| Untitled key | |
| This key will immediately and permanently have its access revoked. | |
| Cancel | |
| Revoking… | |
| Revoke | |
| Failed to revoke the API key | |
| Failed to create the API key | |
| Name | |
| Reporting pipeline | |
| Expires | |
| In {days} days | |
| Creating… | |
| Create | |
| Access | |
| Brand access | |
| All brands | |
| Specific brands | |
| Every brand in this organization, including brands added later. | |
| This organization has no brands yet, so there is nothing to narrow the key to. | |
| Search brands… | |
| No brands found. | |
| Key Created | |
| No access | |
| Key | |
| Brands | |
| Created | |
| Last used | |
| Reason | |
| Actions | |
| You can't view a key after it's created. Create a new key if you need one. | |
| Revoke Key | |
| Keys can't be issued in demo mode. | |
| An organization admin can issue one. | |
| No active API keys | |
| No API keys yet | |
| Issue one to call the REST API or connect an MCP client. | |
| Create your first key | |
| API Docs | |
| Browse the REST API this deployment serves. | |
| Programmatic interface for {appName}. | |
| Base URL | |
| Billing | |
| Manage your plan, usage, and billing. | |
| Could not open the billing portal | |
| Could not change the plan | |
| Payment failed | |
| We couldn't renew your subscription. Tracking continues for a few more days while Stripe retries — update your card in the billing portal to avoid a pause. | |
| Tracking paused | |
| Payment is more than a week overdue, so prompt tracking is paused. Your data stays readable; fix the payment in the billing portal and tracking resumes automatically. | |
| No active subscription | |
| Tracking is stopped until a plan is chosen. | |
| Your subscription is set to cancel on {date}. You can restore it from the billing portal. | |
| Plans | |
| Switching takes effect immediately; Stripe prorates the difference. | |
| What your organization is on, and what it costs. | |
| Manage | |
| Switch to {planName} | |
| Switch | |
| Need more brands, any other models, higher numbers of samples, SSO, white label, or custom limits? | |
| Talk to us about a custom plan | |
| Extra premium | |
| Beyond what your plan includes, at ${price} per pairing per month. | |
| Usage | |
| What your organization is using against its plan. | |
| /year | |
| /month | |
| Manage billing | |
| Choose a plan | |
| {interval} billing · renews {date} | |
| Annual | |
| Monthly | |
| Custom agreement billed outside self-serve. | |
| No subscription on file. | |
| Only organization admins can change the plan. | |
| Tracked prompts | |
| Premium pairings ({count} purchased) | |
| Premium pairings | |
| Update | |
| Purchased pairings | |
| An active subscription is required to buy the add-on. | |
| Could not update the add-on | |
| The brands this organization tracks. | |
| No brands yet. | |
| MCP | |
| Connect an AI client to this deployment over MCP. | |
| Codex reads the key from the environment rather than the config file. | |
| In ~/.cursor/mcp.json. Cursor shows the server as needing login; sign in from there. Older Cursor releases send a callback this deployment can't accept, so use a key if signing in fails. | |
| Or put it under servers in mcp.json. VS Code asks you to sign in the first time it starts the server. | |
| In mcp.json. | |
| In opencode.json, then opencode mcp auth {id}. | |
| In opencode.json. | |
| Connect any chat bot to {appName}. | |
| MCP access is disabled in demo mode. | |
| Endpoint | |
| Connect | |
| Sign in with OAuth | |
| Sign in with API Key | |
| Tools | |
| This deployment is read-only, so the tools that write are withheld from every key. | |
| Tool | |
| What it does | |
| Scope | |
| Team | |
| Invite teammates and manage team members. | |
| Failed to send invitation | |
| Failed to remove member | |
| Failed to cancel invitation | |
| Email | |
| teammate@example.com | |
| Role | |
| Member | |
| Admin | |
| Inviting... | |
| Invite | |
| Members | |
| Remove | |
| Pending invitations | |
| Expires {date} | |

## auth

| English | Türkçe |
|---|---|
| Sign in | |
| Sign in to your account. | |
| Failed to start sign-in | |
| Something went wrong. Please try again. | |
| Try Again | |
| Signing in... | |
| Redirecting to your identity provider | |
| Invalid email or password | |
| That connection request expired. Sign in again, then start the connection from your MCP client. | |
| Please verify your email first — we just sent you a new verification link. | |
| Welcome back | |
| Check in on your AI visibility. | |
| Sign in to your Enrigio instance. | |
| Continue with Google | |
| or | |
| you@example.com | |
| Password | |
| Forgot password? | |
| Don't have an account? | |
| Create one | |
| Demo Account | |
| Sign up | |
| Create an account. | |
| Registration failed | |
| Check your email | |
| We sent a verification link to {email} | |
| Click the link in the email to verify your address and get started. The link expires, so verify soon. | |
| Sending... | |
| Resend verification email | |
| Start tracking your AI visibility | |
| Create your admin account | |
| Plans start at ${price}/mo. Cancel any time. | |
| This is the owner account for your self-hosted instance. | |
| Your name | |
| Create a password | |
| Creating account... | |
| Create account | |
| Already have an account? | |
| Reset password | |
| Request a password reset link. | |
| If an account exists for {email}, a reset link is on its way. | |
| A reset link is on its way. | |
| Reset your password | |
| Enter your email and we'll send you a reset link. | |
| Send reset link | |
| Back to sign in | |
| Choose a new password | |
| Set a new password for your account. | |
| Passwords do not match | |
| Failed to reset password | |
| Reset link invalid or expired | |
| Reset links are single-use and time-limited. | |
| Request a new reset link | |
| New password | |
| Confirm password | |
| Resetting... | |
| Authorize | |
| An MCP client | |
| The authorization server refused the request. | |
| You're signed out | |
| Start the connection from your MCP client again. | |
| This request was made for a session that has since ended, and signing back in won't revive it. | |
| Nothing to authorize | |
| Start the connection from your MCP client. | |
| This link is missing the client it was meant to authorize. | |
| Connect to Enrigio | |
| This client isn't registered with this instance. | |
| Continuing will not work — start the connection from your MCP client again. | |
| {label} is asking to read and manage your Enrigio data. | |
| Client | |
| Identity | |
| Unverified — it named itself | |
| Sends you back to | |
| This client runs on your computer, so Enrigio can't tell which program is asking. Continue only if you just started this from a client you trust. | |
| Its name and callback address come from a document it publishes at {publisherHost}. | |
| It will act as you, in the workspaces you belong to. Revoke it by signing out of the client or removing its access from your account. | |
| Connecting… | |
| Allow {label} | |
| Deny | |

## reports

| English | Türkçe |
|---|---|
| Reports | |
| Generate and view one-time brand reports. | |
| Report request submitted successfully! | |
| Generate one-time brand reports. | |
| Create New Report | |
| Enter brand name | |
| Brand Website | |
| Manual Prompts | |
| (Optional) | |
| Enter one prompt per line, up to 50 | |
| Note: Prompts will NOT be auto-generated. Using your {count} manual prompt(s). | |
| Leave empty to auto-generate prompts based on website analysis, competitors, and keywords. | |
| Creating Report... | |
| Create Report | |
| Report History | |
| Failed to load reports | |
| Loading reports... | |
| No reports found. | |
| View Report | |
| AI Share of Voice Report | |
| Not authorized | |
| {brandName} leads or matches competitors across all tested prompts. | |
| Current SoV | |
| Top Competitor SoV | |
| Goal SoV | |
| Recommendation | |
| Write {count} LLM-friendly articles on “{prompt}” | |
| Prompts Tested | |
| Brand Mentions | |
| AI Engine Performance | |
| Brand mention rate across {count} evaluations | |
| {mentions} of {total} runs | |
| Competitive Landscape | |
| Share of voice comparison across all tested prompts | |
| SoV | |
| Mention Rate | |
| Each prompt is evaluated multiple times across AI engines — mentions show total appearances, unique prompts show how many distinct prompts include the brand | |
| Unique Prompts | |
| Prompt Analysis | |
| Share of voice for representative prompts — strengths and growth opportunities | |
| Prompt Analysis (continued) | |
| Content Gaps | |
| Prompts where competitors appear but {brandName} does not — highest-value opportunities | |
| Competitors Found | |
| {brandName} appears in all prompts where competitors are mentioned. | |
| Top AI Search Queries | |
| Common web search queries AI models run when answering prompts in your category | |
| Brand Mentioned | |
| High | |
| Medium | |
| Low | |
| Prioritize content creation to establish AI presence | |
| Expand content to increase brand share of voice | |
| Maintain leadership and defend competitive position | |
| Share of Voice Opportunity | |
| Overview of your current AI share of voice and growth potential | |
| Prompts With Mentions | |
| Total Prompts Tested | |
| Overall SoV | |
| Opportunity | |
| What Should I Do Next? | |
| Prompts where competitors outperform {brandName} — your biggest growth opportunities | |
| Ready to Optimize Your AI Visibility? | |
| Take your brand's AI presence to the next level with {appName} | |
| Strategic Optimization | |
| Develop content strategies that increase your brand's share of voice in AI responses | |
| Continuous Monitoring | |
| Track your AI share of voice across hundreds of relevant prompts and topics | |
| Competitive Advantage | |
| Stay ahead of competitors in the rapidly evolving AI search landscape | |
| Get started with {appName} today | |
| Visit {url} to learn more about our AI visibility platform and services. | |
| Report status: {status} | |
| Strength | |

## dashboard

| English | Türkçe |
|---|---|
| Overview | |
| Dashboard overview of AI visibility and citations. | |
| Never | |
| Just now | |
| {count}m ago | |
| {count}h ago | |
| {count}d ago | |
| prompts tracked | |
| evaluations | |
| run frequency | |
| last updated | |
| evaluations (30d) | |
| Prompts monitored for AI visibility, each evaluated on: | |
| Prompts monitored for AI visibility. No platforms are configured for this brand yet. | |
| Total number of times we have evaluated prompts against LLMs in the last 30 days. Each prompt is evaluated multiple times across different AI models. | |
| How often each platform is sampled: | |
| No platforms are configured for this brand yet. | |
| The last prompts we evaluated for your brand were run on {date} | |
| No evaluations have been run yet. | |
| You are ready to track your AI visibility. We're currently running the first evaluation against AI models. This usually takes a few minutes. | |
| You have prompts configured but none are currently enabled. Add or enable some prompts to start tracking your AI visibility. | |
| Set up prompts to start tracking your AI visibility. Once configured, we'll evaluate them against AI models automatically. | |
| Waiting for First Evaluation | |
| No Data Yet | |
| Prompts configured and enabled | |
| View Your Prompts | |
| Edit Prompts | |
| Set Up Prompts | |
| Refresh this page in a few minutes to see your AI visibility data. | |
| Research Brand Data | |
| We will analyze your website and find the best generative AI prompts to track. This process may take a couple of minutes. | |
| The percentage of AI answers to your prompts that mention your brand — the big number is the latest point on this line. For prompts that don't name your brand, it's {nonBrandedVisibility}%. Visibility shifts as AI models, the prompts you track, or the sites AI scans change; the line is smoothed for staggered prompt schedules. | |
| Your brand's share of all brand and competitor mentions across the AI answers to your prompts — the big number is the latest point on this line. It shifts as AI models change, as you and competitors publish, or as the sites AI scans move; the line is smoothed for staggered prompt schedules. | |
| AI Visibility | |
| View Visibility | |
| Visibility Trends (30d) | |
| AI Visibility (7d avg) | |
| Share of Voice | |
| View Share of Voice | |
| Share of Voice Trends (30d) | |

## prompts-list-editor

| English | Türkçe |
|---|---|
| Premium models: {summary} | |
| Premium: none | |
| No premium pairings left. Untick one, or {buyMoreLink}. | |
| buy more | |
| This paste is {count} prompt{plural} over the {limit} limit. Remove {lines} to continue. | |
| a line | |
| some lines | |
| Deselect all prompts | |
| Select all prompts | |
| Prompt Text | |
| The question or query that will be sent to AI models for evaluation. | |
| System | |
| Auto-generated tags like "branded" or "unbranded" based on prompt content. | |
| Custom labels to organize and filter prompts. | |
| Premium | |
| Also track this prompt on a model called directly with its own web search on, for a grounded answer with citations — {runs}× a day. Each model you pick here spends one of the organization's premium pairings. This is on top of the platforms the brand tracks, which run on every prompt either way. | |
| Has unsaved changes | |
| Enter prompt text... | |
| Disable prompt | |
| Enable prompt | |
| Select prompt | |
| Add tag... | |
| Search or create tag... | |
| One prompt per line | |
| Prompts to add, one per line | |
| Add {count} Prompt | |
| Add {count} Prompts | |
| {count} selected | |
| Enable | |
| Disable | |
| Premium: {used} of {total} pairings in use across this organization — one for each model a prompt is tracked on. | |
| Unassign one to free it up, or {buyMoreLink}. | |
| Add Prompt | |
| Add Multiple | |
| Maximum of {limit} prompts allowed. Remove a prompt to add a new one. | |
| prompts configured | |

## prompt_details

| English | Türkçe |
|---|---|
| Prompt History | |
| Prompt Details | |
| Detailed analysis of a tracked prompt's performance. | |
| Mentions | |
| Web Queries | |
| LLM Responses | |
| Active | |
| Disabled | |
| Next run: {date} | |
| Tags: | |
| Edit prompts | |
| Failed to load prompt data. Please try again. | |
| No prompt data found. | |
| Tabs | |
| {count} runs in period | |
| No mention data available for this time period. | |
| Only competitors from your tracked competitors list are shown here. | |
| If a competitor isn't showing up, add them to your list. | |
| {brandName} was mentioned in {pct}% of prompt evaluations ({count} total runs). | |
| Prompt Fan-Out | |
| Query Words | |
| Every distinct search engines ran while answering this prompt, with how many runs each engine issued it. Your prompt's keywords are bolded. | |
| {count} distinct searches. | |
| Couldn't load web queries right now. Reload the page to try again. | |
| No web query data available for this time period. | |
| No citation data available for this time period. | |
| No prompt runs found for this time period. | |
| Individual Prompt Runs | |
| Model | |
| Version | |
| Evaluated | |
| Brands Mentioned | |
| None | |
| LLM Response | |
| Raw Output | |

## query_fan_out

| English | Türkçe |
|---|---|
| Query Fan-Out | |
| See the web searches AI engines run when answering your prompts, and how they rewrite your wording. | |
| When an AI engine with web search capabilities responds to a prompt, it may choose to make a number of web searches before creating its answer. These underlying web searches, or web queries, are only available for some engines. | |
| Couldn't load query fan-out right now. Reload the page to try again. | |
| No runs with web search enabled for the selected filters. Fan-out appears once your prompts have been run by an engine with web search. | |
| No web queries in this period — the engines you track didn't expose any searches for these prompts and filters. | |
| The web searches AI engines run when answering your prompts. | |
| Top Queries | |
| Search Prompt Runs | |
| Prompt Runs w/ Unknown Queries | |
| Prompt Runs w/ Known Queries | |
| Average Fan-Out | |
| How many times your prompts were run against engines configured with web search. An engine may still choose not to execute a search on a given run. | |
| Prompt runs that produced at least one web search. Some engines do not expose web searches, so this number may be lower than expected. | |
| Search-enabled runs without known queries. The engine may have chosen not to search at all, searched with just the prompt itself, or searched without revealing its queries. | |
| Average queries per run that had at least one web query. | |
| Prompts | |
| Each prompt's fan-out: how many searches it generates (Queries) and how many per run that searched (Avg/Prompt Run). Expand a prompt to see the searches, with your prompt's keywords bolded. | |
| The web searches each prompt triggers. | |
| Search prompts... | |
| Prompt | |
| Queries | |
| Avg/Prompt Run | |
| (untitled prompt) | |
| {count} variations | |
| Top {shown} of {total} variations shown | |
| No prompts match your search. | |
| The searches with the widest reach — sort by how many distinct prompts triggered them, or how many prompt runs issued them. Expand a query to see the prompts behind it. | |
| The searches that recur across your prompts. | |
| Query | |
| Prompt Runs | |
| Runs of this prompt that issued the search | |
| No queries for this period. | |

## new_brand

| English | Türkçe |
|---|---|
| New brand | |
| Start tracking a new brand in this organization. | |
| Could not create the brand. | |
| Could not read this organization's platforms. | |
| This organization has no plan | |
| You've used every brand on your plan | |
| Go to billing | |
| Create {brandName} | |
| Choose which AI platforms to track | |
| Create brand | |
| Create a new brand | |
| Start tracking a brand in {organizationName} | |
| Brand Name | |
| Website | |
| example.com | |
| Continue | |

## opportunities-report

| English | Türkçe |
|---|---|
| Creation | |
| Net-new content to publish or earn — comparisons, guides, and 'best of' angles for topics you're absent on. | |
| Existing Content | |
| Pages already getting cited that are slipping, or could win the mention with a refresh. | |
| Outreach | |
| Earn placements on the third-party review sites and editorial roundups assistants cite. | |
| Social | |
| Show up in the community conversations — Reddit, YouTube, forums — assistants pull from. | |
| Your citations | |
| Competitor citations | |
| No specific prompts linked. | |
| You're not cited for these prompts yet. | |
| No competitor pages cited for these prompts. | |
| Summary | |
| Reality Check | |
| Generated by AI from your tracked citation data. Suggestions are a starting point — apply your own judgment before acting. | |

## fanout-sections

| English | Türkçe |
|---|---|
| {models} ran with web search enabled but the queries are unknown — the engine may not have searched, searched with just the prompt itself, or searched without revealing its queries. | |
| Times each engine ran this search | |
| Times engines ran this search | |
| No web queries for this selection. | |
| Words engines add that weren't in your prompt — the intent they layer on (e.g. “best”, “2026”, “vs”). | |
| Words from your prompt engines keep in their searches. | |
| Words from your prompt engines leave out of their searches. | |
| Word Changes | |
| How engines rewrite your prompt wording. | |
| Hide stop words | |
| Added | |
| Preserved | |
| Dropped | |
| No {tab} words{stopWordsHint}. | |
| (try showing stop words) | |

## prompt-wizard

| English | Türkçe |
|---|---|
| Add item... | |
| items added. Remove an item to add a new one. | |
| items entered. | |
| Analysis failed | |
| Brand analysis timed out. Please try again. | |
| Failed to save | |
| We'll analyze {website} using web search to suggest competitors, additional domains/aliases, and a starter set of AI prompts to track. | |
| Analyzing brand… | |
| Brand details | |
| Confirm the brand identity, additional domains, and aliases used for tracking. | |
| Brand name | |
| Companies you want tracked alongside your brand. | |
| Pick which AI tracking prompts to start with. Untick any you don't want, edit tags, or add your own at the bottom. | |
| Saving… | |
| Start tracking ({count} new prompts) | |

## unsaved-changes-bar

| English | Türkçe |
|---|---|
| Unsaved changes | |
| Discard | |
| Save changes | |
| Discard changes? | |
| {summary} will be reverted. | |
| Your changes will be reverted. | |
| This can't be undone. | |
| Keep editing | |
| Discard changes | |
| Leave without saving? | |
| You have unsaved changes ({summary}). | |
| You have unsaved changes. | |
| They'll be lost if you leave this page. | |
| Stay on page | |
| Leave without saving | |

## share_of_voice

| English | Türkçe |
|---|---|
| See how often AI engines mention you versus your competitors. | |
| Number of runs in which this brand was mentioned in the AI answer. | |
| This brand's share of all brand + competitor mentions. | |
| Number of distinct prompts this brand appeared in. | |
| Share of voice is how often each brand is mentioned in the AI answers to your prompts. Mentions are counted per run, so the brand and competitor figures use the same unit and are directly comparable. | |
| Competitors are the ones you track in settings. Switch the model filter to compare engines. | |
| No mention data yet for the selected filters. Mentions appear once your prompts have been run. | |
| {brandName} across {totalRuns} runs and {count} competitors. | |
| Share of Voice Trends | |
| Share of Voice Leaderboard | |
| Share | |
| You | |
| How often AI engines mention you versus your competitors. | |

## filter-bar

| English | Türkçe |
|---|---|
| Last 7 days | |
| Last 30 days | |
| Last 3 months | |
| Last 6 months | |
| Last 12 months | |
| All time | |
| Tags | |
| Clear | |
| No tags available | |
| Clear search | |
| {count} result | |
| {count} results | |
| {count} of {total} results | |

## recent-changes-card

| English | Türkçe |
|---|---|
| New Pages | |
| Dropped Pages | |
| Title Changes | |
| New Domains | |
| Dropped Domains | |
| 0 → {count} citations across {promptCount} prompt{plural} | |
| {previousCount} → {currentCount} citations | |
| {count} citation{plural} in the current period | |
| {previousCount} citation{plural} last period, none now | |
| Recent Changes | |
| Compares this {period} with the {period} before it. Shows new and dropped pages, title changes, and new and dropped domains. | |
| How AI citations have shifted over the past {period} | |
| No {changeType} changes in this period. | |

## top-urls-card

| English | Türkçe |
|---|---|
| Top Cited URLs | |
| The specific pages most frequently cited by AI models. Filter by category to focus on brand, competitor, or other sources. | |
| Competitor domains are only those in your {trackedCompetitorsLink}. | |
| tracked competitors list | |
| Individual pages cited by LLMs | |
| — {brandName} accounts for {brandShare}% of all citations | |
| Search URLs... | |
| avg {position} | |
| Average citation position (lower = cited earlier in the response) | |
| Total times this URL was cited across all prompt evaluations | |
| No URLs match the current filters. | |

## invitation

| English | Türkçe |
|---|---|
| Accept invitation | |
| Join your team. | |
| This invitation could not be loaded | |
| Invitation unavailable | |
| Make sure you're signed in with the email address that received this invitation. | |
| Switch account | |
| Failed to accept the invitation | |
| You've been invited to join {organizationName} | |
| Invited by {inviterEmail} | |
| Accepting... | |

## new_organization

| English | Türkçe |
|---|---|
| New organization | |
| Create an organization to hold its own brands, team, and plan. | |
| Could not create the organization. | |
| Create an organization | |
| An organization holds its own brands, team, and plan. | |
| Organization Name | |
| Acme | |
| Creating... | |
| Create organization | |

## citations

| English | Türkçe |
|---|---|
| Citations | |
| See which sources LLMs cite in responses to your prompts. | |
| Citations are the links and sources that AI models include in their responses when answering your prompts. They show which websites the AI considers authoritative or relevant to your topics. | |
| Competitor domains are only those you've added to your tracked competitors list. Other domains appear under their detected category (Google, Social Media, Institutional, or Other). | |
| See which sources LLMs cite when responding to your prompts. | |
| Failed to load citation data. Please try again. | |
| No citations found for the selected filters. | |
| Try adjusting your filters or time period. | |
| No citations found. Citations are only available from prompts evaluated with web search enabled. | |

## competitors-editor

| English | Türkçe |
|---|---|
| Unnamed competitor | |
| The primary name used to detect this competitor in AI responses. Mention detection applies to future prompt runs only. | |
| Competitor name | |
| Domains | |
| All domains owned by this competitor. Citation categorization updates retroactively — existing citations from these domains will immediately be classified as "competitor". | |
| Alternative names for this competitor (sub-brands, product names, abbreviations). Used for mention detection in future prompt runs only — does not apply retroactively. | |
| Add Competitor | |
| Maximum of {max} competitors allowed. Remove a competitor to add a new one. | |
| {count}/{max} competitors configured | |

## nav-user

| English | Türkçe |
|---|---|
| Account and organizations | |
| Account | |
| Your Account | |
| {parentName} Dashboard | |
| Log out | |
| Switch Brand | |
| Loading organizations… | |
| Retrying… | |
| Couldn't load your organizations — retry | |

## opportunities

| English | Türkçe |
|---|---|
| Opportunities | |
| AI-generated opportunities to earn more AI citations. | |
| Recommendations based on your visibility and citation metrics. Refreshed weekly. | |
| Couldn't generate recommendations right now. Reload the page to try again. | |
| We need a bit more tracking data before we can recommend opportunities — check back once your prompts have run for a few days. | |
| What to create, pitch, and seed to earn more AI citations — generated from your tracked answer data. | |
| Last evaluated {date} | |
| Analyzing your citation landscape and drafting your opportunities… | |

## cached-prompt-chart

| English | Türkçe |
|---|---|
| Evaluating for the first time | |
| Results will appear here shortly. | |
| No data in selected time range | |
| Try selecting a longer time period to see historical data. | |
| No brands found in responses | |
| Your brand and competitors weren't mentioned in the evaluated responses for this prompt. | |
| {visibility}% Visibility | |

## citations-shared

| English | Türkçe |
|---|---|
| 24 hours | |
| week | |
| 2 weeks | |
| month | |
| 2 months | |
| 3 months | |
| {days} days | |

## track-domain-popover

| English | Türkçe |
|---|---|
| Track {domain} | |
| Add as brand domain | |
| Applies retroactively — all existing and future citations from this domain will be classified as your brand. | |
| My brand | |
| Add to existing competitor | |
| Applies retroactively — all existing and future citations from this domain will be classified under the selected competitor. | |
| Or create new competitor: | |

## citations-display

| English | Türkçe |
|---|---|
| All Sources | |
| All Page Types | |
| Citation Categories | |
| Share of citations by source category over time, as a percentage of all citations each day. Smoothed to account for staggered prompt schedules; Google AI Mode search/shopping are excluded (see the Google Shopping section). | |
| Citation Page Types | |
| Share of citations by page type over time — what kind of page each citation points to, inferred from the URL and title. | |

## lookback-selector

| English | Türkçe |
|---|---|
| 1w | |
| 1mo | |
| 3mo | |
| 6mo | |
| 1yr | |
| all | |

## reddit-card

| English | Türkçe |
|---|---|
| Reddit | |
| Reddit communities most frequently cited by AI models. Extracted from all reddit.com URLs in your citation data. | |
| Top cited subreddits — which Reddit communities AI models reference when answering your prompts | |
| NEW | |
| +{count} new | |
| some dropped | |

## stats-cards

| English | Türkçe |
|---|---|
| Brand Citation Share | |
| The percentage of all citations that link to your brand's domain. A higher share means AI models are more likely to reference your content. | |
| Unique Domains | |
| The number of distinct domains cited across all prompt evaluations in this period. | |
| Total Citations | |
| The total external websites cited by AI models across prompt evaluations. | |

## prompts-display

| English | Türkçe |
|---|---|
| Failed to load prompts data | |
| Try refreshing the page | |
| No prompts match your filters. | |
| Try adjusting your search or tag filters. | |
| No prompts yet. | |
| Edit | |

## organizations

| English | Türkçe |
|---|---|
| Organizations and Brands | |
| Modify organizations or navigate to brands. | |
| No organizations | |
| Your account isn't a member of an organization yet. | |
| Ask an admin to invite you, then reload this page. | |

## app-sidebar

| English | Türkçe |
|---|---|
| Organization Settings | |
| Docs | |
| API | |
| Dashboard | |
| Settings | |

## brand-onboarding

| English | Türkçe |
|---|---|
| Setup {brandName} | |
| Configure your brand to get started | |
| Setting up... | |
| Complete Setup | |
| Enter your brand's website | |

## top-domains-card

| English | Türkçe |
|---|---|
| Top Cited Domains | |
| The most frequently cited domains across all prompt evaluations. Each domain is colored by its category (brand, competitor, etc.). | |
| Which domains LLMs reference most when responding to your prompts | |
| Search domains... | |
| No domains match the current filters. | |

## platform-selection-step

| English | Türkçe |
|---|---|
| Your plan includes {model} tracking. You can change platforms anytime in settings. | |
| Your plan tracks up to {limit} platform{plural} for this brand. You can change these anytime in settings. | |
| Pick at least one platform. | |
| {selected} of {limit} selected | |
| Back | |

## visibility-bar

| English | Türkçe |
|---|---|
| {percent}% Visibility | |
| AI visibility for the {count} prompt{plural} shown below, calculated as the percentage of AI responses that mention your brand over the time period for the selected filters. | |
| runs | |
| citations | |
| No visibility data for the selected time range and filters. | |

## tags-input

| English | Türkçe |
|---|---|
| Select... | |
| Search... | |
| No results. | |
| Maximum reached | |
| Remove {value} | |

## not_found

| English | Türkçe |
|---|---|
| Not found | |
| 404 Not Found | |
| The page you're looking for doesn't exist. | |
| Go Back | |

## visibility

| English | Türkçe |
|---|---|
| Visibility | |
| Track how LLMs respond to prompts about your brand. | |
| Track how different LLMs respond to prompts related to your brand, products, and competitors. | |
| See how LLMs are evaluating prompts related to your brand. | |

## missing-env-page

| English | Türkçe |
|---|---|
| Missing environment configuration | |
| Deployment mode: {mode} | |
| Set these via the CLI. | |
| Set these in the deployment environment, then redeploy or restart. | |

## prompts-editor

| English | Türkçe |
|---|---|
| {count} added | |
| {count} edited | |
| {count} removed | |
| Failed to save prompts. | |

## chart-footer

| English | Türkçe |
|---|---|
| Download chart as PNG | |
| Exporting... | |
| Export (PNG) | |

## filtered-list-shell

| English | Türkçe |
|---|---|
| No results match your filters. | |
| Try adjusting your search or filters. | |
| Clear filters | |

## list-pagination

| English | Türkçe |
|---|---|
| {start}–{end} of {total} | |
| Previous | |
| Next | |

## sidebar

| English | Türkçe |
|---|---|
| Sidebar | |
| Displays the mobile sidebar. | |
| Toggle Sidebar | |

## brand

| English | Türkçe |
|---|---|
| AI visibility tracking for {brandName}. | |
| AI visibility tracking and optimization. | |

## root

| English | Türkçe |
|---|---|
| {appName} - AI Search Optimization | |
| Track and optimize your brand's visibility across AI models. | |

## demo-mode-pill

| English | Türkçe |
|---|---|
| Demo | |
| This is a read-only demo. Any edits will fail. | |

## prompt-chart-print

| English | Türkçe |
|---|---|
| Evaluating for the first time... | |
| {value}% {label} | |

## command

| English | Türkçe |
|---|---|
| Command Palette | |
| Search for a command to run... | |

## home

| English | Türkçe |
|---|---|
| Sign In | |

## api-reference

| English | Türkçe |
|---|---|
| Schemas | |

## base-chart-print

| English | Türkçe |
|---|---|
| No data available | |

## base-chart

| English | Türkçe |
|---|---|
| Chart series | |

## chart-export-preview

| English | Türkçe |
|---|---|
| {name} logo | |

## copy-button

| English | Türkçe |
|---|---|
| Copy | |

## full-page-card

| English | Türkçe |
|---|---|
| Go to your organizations | |

## history-button

| English | Türkçe |
|---|---|
| View Details | |

## nav-app-info

| English | Türkçe |
|---|---|
| rigosis.com | |

## not-found-page

| English | Türkçe |
|---|---|
| That page doesn't exist or moved. | |

## platform-picker

| English | Türkçe |
|---|---|
| ≈{cost}/run | |

## prompt-order-dropdown

| English | Türkçe |
|---|---|
| Sort | |

## share-of-voice-donut

| English | Türkçe |
|---|---|
| Others | |

## word-cloud

| English | Türkçe |
|---|---|
| No terms for this period. | |

## dialog

| English | Türkçe |
|---|---|
| Close | |

## breadcrumb

| English | Türkçe |
|---|---|
| More | |

## spinner

| English | Türkçe |
|---|---|
| Loading | |

## admin *(cloud-only — skip for the demo)*

| English | Türkçe |
|---|---|
| Monitor and manage brands, prompts, and scheduling. | |
| Please enter a delay value | |
| Delay must be at least 1 hour | |
| Failed to update | |
| Failed to clear override | |
| Configure Job Delay for {brandName} | |
| Set a custom delay for how often prompt jobs run. Default is {delay}. | |
| Custom Delay | |
| Weeks | |
| Days | |
| Hours | |
| Current: {delay} | |
| (custom) | |
| (default) | |
| Total: {delay} | |
| Clear Override | |
| Updating... | |
| Custom | |
| Default | |
| An error occurred | |
| Error | |
| Admin Dashboard | |
| Monitor and manage brands, prompts, and job scheduling | |
| All Brands | |
| Total: {count} brands | |
| Total Brands | |
| Active Brands | |
| With runs in last 30 days: {count} | |
| Active: {active} \| Total: {total} | |
| Enabled | |
| Runs | |
| 7d: {runs7d} \| 30d: {runs30d} | |
| Brand Statistics | |
| Detailed statistics and configuration for each brand | |
| Prompts (7d) | |
| Prompts (30d) | |
| Runs (7d) | |
| Runs (30d) | |
| Last Run | |
| Run Delay | |
| Brand onboarding analysis. | |
| Please enter a website URL | |
| Analyze brand | |
| Run the onboarding analysis for any website. | |
| Website URL | |
| Brand name (optional) | |
| Auto-detected from URL | |
| Analyzing… (this may take a minute) | |
| Analyze | |
| Copied | |
| Copy prompts | |
| Copy JSON | |
| Additional domains | |
| Aliases | |
| Run the onboarding analysis for any brand without creating it. Same pipeline as the wizard and {endpoint}. | |
| Brand analysis | |
| Analyze a website to discover its competitors, additional brand domains, aliases, and suggested AI tracking prompts. Works with any configured LLM provider. | |
| Workflows | |
| Monitor prompt scheduling and job execution. | |
| Unknown | |
| Overdue | |
| in {duration} | |
| {duration} ago | |
| pg-boss Job Queue Status | |
| Jobs waiting to be picked up by a worker | |
| Jobs currently being processed | |
| Jobs waiting to be retried after failure | |
| Retry | |
| Completed | |
| Failed | |
| Total Pending | |
| Next: {time} | |
| Scheduler Reset | |
| Queued | |
| Failed to retry | |
| Loading logs... | |
| Error loading logs: {error} | |
| No logs available | |
| Could not retry this job | |
| Job queued for retry | |
| Retry This Job | |
| View Logs | |
| Failed Job Details | |
| Completed Job Details | |
| Job ID: {id} | |
| Status | |
| Prompt ID | |
| Finished At | |
| N/A | |
| Error Message | |
| Execution Logs | |
| {count} overdue | |
| All on schedule | |
| Prod Scheduler | |
| Last Job | |
| Processing... | |
| In queue | |
| Retrying soon | |
| Monitor prompt scheduling, job execution, and worker health | |
| Refresh | |
| Schedule Health | |
| on schedule | |
| On Schedule | |
| prompts | |
| of {count} enabled | |
| Overdue >30min | |
| {count} additional recently expired | |
| brands | |
| {count} total prompts | |
| Prompt Queue | |
| Brand Workflow Status | |
| Click on a brand to expand and see individual prompt status | |
| Run Frequency | |
| Health | |

## plan-comparison *(cloud-only — skip for the demo)*

| English | Türkçe |
|---|---|
| Limits | |
| Platforms per brand | |
| Sampling | |
| {count}×/day | |
| Seats | |
| Unlimited | |
| API access | |
| Included | |
| Buy more | |
| ${price}/mo each | |
| Current | |
| Popular | |
| /yr | |
| /mo | |
| Not included | |

## choose-plan *(cloud-only — skip for the demo)*

| English | Türkçe |
|---|---|
| Pick a plan to start tracking how AI answer engines talk about your brand. | |
| Activating your organization… | |
| Payment received — finishing setup. This takes a few seconds. | |
| Could not start checkout | |
| Choose your plan | |
| Start tracking how AI answer engines talk about your brand. | |
| Annual billing | |
| 2 months free | |
| Only an organization admin can choose a plan. Ask the person who created this organization. | |
| Subscribe to {planName} | |
| Subscribe | |

## sales-panel *(cloud-only — skip for the demo)*

| English | Türkçe |
|---|---|
| See how AI answers talk about your brand. | |
| Track your AI visibility on any model | |
| Benchmark against your competitors | |
| Analyze citations to find opportunities | |
| Unlimited prompts, brands, and seats | |
| Tracking | |
| by Rigosis | |
