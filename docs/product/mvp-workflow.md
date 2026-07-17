# ResumAI V2 MVP Workflow

## Purpose

ResumAI is a job-application workspace. It helps a job seeker organize
applications, use AI to create truthful resume working copies, and preserve the
exact finalized resume associated with each application.

The dashboard is the user's home base. The product guides users toward useful
next steps without forcing them to upload a resume, create an application, or
begin tailoring before they are ready.

## Responsibility boundaries

**The user** supplies account information, source resumes, application details,
revision requests, and final approval.

**The system** validates input, preserves files and records, enforces product
rules, coordinates workflows, and presents clear success, failure, and recovery
states.

**AI** analyzes a selected resume against a job description and proposes a
complete working copy. AI never modifies an original uploaded PDF, approves its
own output, or finalizes a resume.

Any internal resume parsing or extraction is an implementation concern. It is
not a required user-facing verification workflow for MVP.

## Concise product states

### Account and session

- Signed out
- Authenticated
- Session restoring
- Session expired

### Base resume

- Uploading
- Rejected
- Available
- Replaced or removed from active use
- Preserved for application history

### Application

- Saved without tailoring
- Ready for tailoring
- Tailoring in progress
- Working copy ready for review
- Working copy accepted
- Finalized

Application tracking status is separate from tailoring state.

### Working copy

- Absent
- Generating
- Awaiting review
- Revision requested
- Accepted
- Discarded
- Failed

Only the current mutable working copy is retained for MVP.

### Finalized resume

- Generating
- Available
- Generation failed

A finalized resume and its PDF are immutable.

## Golden path

1. The user signs up or signs in.
2. The system restores the authenticated session and opens the dashboard.
3. The empty dashboard explains that a base resume is needed before tailoring
   and offers an upload action.
4. The user uploads an existing PDF resume.
5. The system validates and privately preserves the original PDF.
6. The resume becomes available for application use.
7. The dashboard offers a clear “Create your first application” action.
8. The user creates an application and enters the role information they have.
9. The application is saved without automatically starting AI.
10. When ready, the user selects an available base resume and explicitly
    requests tailoring.
11. The system prepares the selected resume and application information.
12. AI analyzes the role and produces a complete proposed working copy.
13. The system validates the result and presents the working copy for review,
    including material changes and their reasons.
14. The user accepts the complete working copy.
15. The user explicitly finalizes it.
16. The system freezes the accepted content, generates the PDF, stores it
    privately, and attaches it to the application.
17. The user downloads the finalized PDF and continues tracking the
    application.
18. On a later visit, the user opens the application and can see the original
    role information, notes, tracking state, source resume used, and exact
    finalized resume.

## 1. Account and onboarding

### Entry point

The user opens ResumAI while signed out, follows an authentication link, or
returns with a previously established session.

### Preconditions

- The service is available.
- The user can access the chosen email-based authentication method.

### User actions

- Sign up or sign in.
- Correct invalid information or retry a failed authentication attempt.
- Leave the dashboard and return later.
- Upload a resume or create an application only when ready.

### System actions

- Validate authentication input.
- Establish or restore a session.
- Create or locate the user's product profile.
- Route the authenticated user to the dashboard.
- Show a useful dashboard state based on the user's existing resumes and
  applications.
- When no base resume exists, explain the value of uploading one and provide an
  upload action.
- When at least one base resume exists, provide a clear application-creation
  action.

### AI actions

None.

### Product states

- Signed out
- Session restoring
- Authenticated
- Session expired
- Dashboard empty state
- Dashboard with one or more available resumes

### Successful outcome

The user reaches the dashboard with an authenticated session and understands
the next available actions without being forced into a workflow.

### Failure states

- Invalid or incomplete authentication input
- Authentication link or code expired
- Session restoration failed
- Network or service failure
- Auth identity exists but the application profile cannot be loaded

### Recovery behavior

- Keep entered non-sensitive information where safe.
- Explain whether the user should correct, retry, or request a new
  authentication link.
- Return an expired session to sign-in without exposing protected content.
- Allow a transient dashboard load to be retried.
- Resolve profile setup automatically when possible; otherwise show a
  recoverable error rather than a partially initialized dashboard.

### Important edge cases

- A returning user with no resumes sees the same helpful upload prompt.
- A returning user with resumes but no applications sees application creation
  as the primary next step.
- A user may sign out before uploading anything.
- Refreshing the page must not incorrectly display another user's data or a
  signed-out state while restoration is still in progress.

## 2. Base-resume upload and management

### Entry point

The authenticated user starts an upload from the dashboard or resume-management
area.

### Preconditions

- The user is authenticated.
- The user has fewer than three active base resumes.
- The selected file is an existing PDF.

### User actions

- Select a PDF for upload.
- Optionally give it a recognizable name if naming is offered.
- Retry with a corrected file when validation fails.
- Upload additional resumes up to the active limit.
- Leave and return later.
- Remove or replace an active resume when appropriate.

### System actions

- Validate that the upload is a supported, non-empty PDF within configured
  limits.
- Reject invalid or unsupported files before making them available.
- Store the original uploaded PDF privately and immutably.
- Create the durable resume record required to use that PDF in an application.
- Make the resume available once basic validation and storage succeed.
- Enforce a maximum of three active base resumes.
- Preserve historical source versions used by applications even when they are
  no longer active.
- Present upload progress, success, and failure clearly.

### AI actions

None in the user-facing upload workflow.

Any internal interpretation needed for later tailoring does not make the resume
user-verified and does not require an extraction-review wizard in MVP.

### Product states

- No active resumes
- Uploading
- Rejected
- Available
- Active limit reached
- Removed or replaced from active use
- Preserved for historical reference

### Successful outcome

The original PDF is safely preserved and the base resume is available for
selection when the user chooses to tailor an application.

### Failure states

- The file is not a PDF.
- The file is empty, corrupt, encrypted, unreadable, or exceeds configured
  limits.
- Upload or storage fails.
- The active-resume limit has been reached.
- The session expires during upload.

### Recovery behavior

- Explain the actionable validation problem without losing existing resumes.
- Let the user select another file and retry.
- Do not create an available resume from an incomplete upload.
- When the limit is reached, show existing active resumes and allow the user to
  leave without changing them.
- If replacement is later chosen, clearly distinguish removal from historical
  deletion.

### Important edge cases

- Uploading the same file twice must not silently overwrite an existing source
  PDF.
- A failed second or third upload must not affect previously available resumes.
- Removing an active resume must not break an application that used it.
- The user may keep only one resume indefinitely; uploading three is optional.
- Upload success does not imply that machine interpretation for AI will always
  succeed later.

## 3. Application creation and AI tailoring

### Entry point

The authenticated user chooses to create an application from the dashboard, or
opens an existing application and chooses to start tailoring.

### Preconditions

For application creation:

- The user is authenticated.

For tailoring:

- The application belongs to the user.
- The application contains the job information required for meaningful
  tailoring.
- An available base resume has been selected.
- The user explicitly requests AI tailoring.

### User actions

- Enter or update company, role, job-description, posting-link, date, status,
  and notes information as available.
- Save the application without tailoring.
- Select an available base resume.
- Explicitly start tailoring.
- Review the complete proposed working copy and explanation of material
  changes.
- Accept it, request another revision, or discard it.
- Explicitly finalize an accepted working copy.
- Download the finalized PDF.

### System actions

- Validate and save application information.
- Keep the application as the central record whether or not tailoring occurs.
- Never start AI merely because the application was created or a resume was
  selected.
- Preserve the selected source-resume version for historical reference.
- Prepare the source resume and job information when tailoring is requested.
- Present clear processing states and prevent accidental duplicate operations.
- Validate AI output before presenting it.
- Preserve the last valid working copy if a revision attempt fails.
- Replace the current working copy when a requested revision succeeds.
- Discard the working copy without deleting the application or original resume.
- Require explicit acceptance before finalization.
- Generate and privately preserve an immutable finalized PDF.
- Attach the exact finalized artifact to the application.

### AI actions

- Analyze the selected base resume against the job description.
- Identify relevant opportunities supported by source content.
- Produce a complete working copy rather than modifying the original PDF.
- Explain material changes and their relationship to the role.
- Respond to a user's revision request by producing a replacement working copy.
- Avoid unsupported employers, titles, dates, metrics, experience, skills, or
  credentials.

AI does not:

- edit the uploaded PDF;
- decide that its output is truthful or accepted;
- update tracking status or notes;
- finalize or render the PDF.

### Product states

- Application saved without tailoring
- Ready for tailoring
- Tailoring in progress
- Tailoring failed
- Working copy awaiting review
- Revision requested
- Working copy accepted
- Working copy discarded
- Finalization in progress
- Finalization failed
- Finalized resume available

### Successful outcome

The user has a saved application and, when tailoring is chosen, an immutable
finalized PDF derived from a reviewed working copy and attached to that
application.

### Failure states

- Required application or tailoring input is missing.
- The selected base resume is unavailable.
- Resume interpretation cannot support tailoring.
- AI or network processing fails or times out.
- AI output is malformed or fails support validation.
- A revision request fails.
- The session expires during a long operation.
- PDF generation or storage fails.
- The same action is accidentally submitted more than once.

### Recovery behavior

- Preserve the application independently of tailoring failure.
- Explain missing information and return the user to the relevant application
  fields.
- Keep the original resume unchanged.
- Allow safe retry of interpretation, tailoring, revision, or finalization.
- Preserve the last valid working copy when a replacement fails.
- If validation rejects AI output, do not present or persist it as a valid
  proposal.
- If finalization fails, keep the accepted working copy available for retry.
- Reauthenticate when required and return to the owned application where safe.

### Important edge cases

- An application may remain saved indefinitely without tailoring.
- The user may change the selected base resume before starting tailoring.
- Changing source resumes after a working copy exists requires an explicit new
  tailoring operation rather than silently reusing the old result.
- A discard removes the current proposal, not the application or source resume.
- Individual line-by-line acceptance is not available in MVP.
- A finalized artifact cannot be edited in place.
- A later revision may create a new final artifact without altering the prior
  historical artifact.

## 4. Existing application history and return visits

### Entry point

The authenticated user returns to the dashboard, browses their applications,
and opens one.

### Preconditions

- The user is authenticated.
- The requested application belongs to that user.

### User actions

- View the application list.
- Open an application.
- Review the saved company, role, job description, posting link, dates, status,
  and notes.
- Update permitted tracking details such as status and notes.
- Resume an unfinished tailoring workflow.
- View or download the exact finalized resume associated with the application.

### System actions

- Show only applications owned by the authenticated user.
- Restore the application's latest valid workflow state.
- Preserve immutable source and finalized resume references.
- Save permitted tracking changes without altering historical artifacts.
- Clearly distinguish an active working copy from a finalized resume.
- Provide authorized, private access to stored PDFs.

### AI actions

None unless the user explicitly starts or resumes a tailoring request.

Opening an application never triggers AI automatically.

### Product states

- Application list loading
- Application available
- Application not found or inaccessible
- Application saved without tailoring
- Working copy awaiting review
- Working copy accepted
- Finalized
- Tracking update failed

### Successful outcome

The user can reconstruct what role they pursued, what information they saved,
which source resume was used, and the exact finalized resume preserved for that
application.

### Failure states

- Application cannot be found.
- The authenticated user does not own the requested application.
- A tracking update conflicts with newer saved data.
- A historical document is temporarily unavailable.
- The session expires.

### Recovery behavior

- Never reveal whether another user's inaccessible application exists.
- Return the user to their own application list after a missing or inaccessible
  record.
- Preserve unsaved note text locally where safe and allow retry.
- Do not replace existing data silently after a conflict.
- Allow an authorized document download to be retried.
- Restore the user's place after reauthentication where safe.

### Important edge cases

- The selected base resume may no longer be active but must remain represented
  in application history.
- Notes and tracking status may change without changing the finalized resume.
- An application with no working copy or final resume is still a valid
  application.
- Returning to an accepted but unfinalized working copy should make the next
  decision clear.

## Major decision points

- Whether to upload a base resume now or return later
- Whether to keep one active resume or upload as many as three
- Whether to create an application after a resume becomes available
- Whether to save an application without tailoring
- Which available base resume to use
- When to explicitly begin tailoring
- Whether to accept, revise, or discard the complete working copy
- Whether to finalize an accepted working copy
- Whether to update tracking information on a return visit

## Approved product rules

- The dashboard is the user's home base.
- Users upload one to three existing PDF base resumes.
- Upload and basic validation make a resume available for application use.
- Users are not forced through extraction review or structured verification.
- Original uploaded PDFs remain immutable.
- Applications are the central product object.
- Applications may exist without tailoring.
- AI runs only when the user explicitly requests it.
- AI creates a mutable, reviewable working copy and never edits the source PDF.
- Users accept, request revisions to, or discard the complete working copy.
- Individual line-by-line acceptance is outside MVP.
- MVP retains only the current working copy, not a full AI revision history.
- Finalized resume content and PDFs are immutable.
- Historical applications preserve the exact source and finalized resume
  versions used.
- PDF is the only required upload and export format for MVP.
- Internal interpretation and extraction design belongs to architecture rather
  than this user-facing workflow.

## Deliberately deferred product details

The exact controlled application-status vocabulary, detailed archive behavior,
and future per-change review experience may be decided in later bounded product
work. They do not change the approved MVP journey above.
