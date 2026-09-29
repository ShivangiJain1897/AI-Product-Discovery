// Synthetic demo content. Everything here is invented for illustration.

export const A_INTERVIEWS = [
  {
    key: "rm1", title: "Interview — Relationship manager (synthetic)", participant: "P-RM1", segment: "Relationship managers", date: "2025-02-10",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Relationship manager, mid-market clients. Interviewed 10 Feb 2025.

Q: Walk me through what happens after a client signs the application.
RM1: I send the document request straight away. The client usually replies with some of the files, but not all of them. Most of the time they are not sure which documents count as proof of address.
RM1: I end up chasing clients by email two or three times per application. I keep a spreadsheet of who owes me what because the system does not show it.
RM1: Once operations has the files, I lose sight of the case. I only find out that something is wrong when the client calls me and asks what is happening.
Q: Where does the time go?
RM1: Honestly I think compliance is the bottleneck. Cases sit in their queue for days. But I also know I am slow to chase sometimes when I have a full pipeline.
RM1: The welcome call is the part clients like best. I would not want to lose it.`,
  },
  {
    key: "ops1", title: "Interview — Operations analyst (synthetic)", participant: "P-OPS1", segment: "Operations", date: "2025-02-12",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Operations analyst, document checking. Interviewed 12 Feb 2025.

Q: How do you decide a file is complete?
OPS1: I open each document and tick it off against a checklist in a separate spreadsheet. The checklist changes by client type, so I have to look up the rules every time.
OPS1: When something is missing I send it back to the relationship manager, and then I have no idea when it will return. I check the same case again two or three days later just in case.
OPS1: I re-check documents that I have already checked because nothing tells me the file was already reviewed. There is no single status I can trust.
Q: What would help?
OPS1: A clear status on each document would help enormously. Also if the client could see what is still missing, half of my rework would disappear.`,
  },
  {
    key: "ops2", title: "Interview — Operations analyst 2 (synthetic)", participant: "P-OPS2", segment: "Operations", date: "2025-02-13",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Operations analyst, account setup. Interviewed 13 Feb 2025.

OPS2: Account setup itself is quick once I get a complete file. The trouble is that files reach me with gaps, so I have to go back and ask again.
OPS2: I spend a lot of time re-entering details from the documents into the account system because the two systems do not talk to each other.
OPS2: I do not think compliance is the slowest step. When the file is complete, their review usually takes a day. The delay is in getting a complete file to them.
OPS2: Nobody owns the case end to end, so when a case stalls everyone assumes someone else is following up.`,
  },
  {
    key: "cmp1", title: "Interview — Compliance reviewer (synthetic)", participant: "P-CMP1", segment: "Compliance", date: "2025-02-14",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Compliance reviewer, KYC. Interviewed 14 Feb 2025.

CMP1: When the file is complete the review is routine and usually takes about a day.
CMP1: The cases that take longer are the ones where I discover, late in the review, that I need an additional explanation for the source of funds. I then have to send the case back and wait for the client to answer.
CMP1: I would like the source-of-funds question asked at the start, but the application form does not ask it.
CMP1: I am worried about automating the document checks, because a wrong pass would create audit risk for us.`,
  },
  {
    key: "cl1", title: "Interview — New client A (synthetic)", participant: "P-CL1", segment: "Clients", date: "2025-02-17",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: New client, small business owner. Interviewed 17 Feb 2025.

CL1: The request email listed documents but I was not sure whether a bank statement or a utility bill counted as proof of address. I sent both, and then they asked me again for a third thing.
CL1: After I uploaded my files I had no idea what was happening. I did not know if anybody had even looked at them.
CL1: I was worried that I had sent the wrong things and I did not want to bother my relationship manager. The welcome call at the end was really helpful, though.`,
  },
  {
    key: "cl2", title: "Interview — New client B (synthetic)", participant: "P-CL2", segment: "Clients", date: "2025-02-18",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: New client, freelance consultant. Interviewed 18 Feb 2025.

CL2: I was not sure which documents were needed, so I uploaded everything I could find. I would have liked one clear list with examples of what is acceptable.
CL2: Two weeks passed and I got an email saying a document was unclear. I had to find it again and send it a second time.
CL2: The process was fine once I understood it, but the waiting with no updates made me nervous.`,
  },
];

export const A_SOP = {
  title: "Client onboarding — standard operating procedure (synthetic)", date: "2024-11-01",
  content: `SYNTHETIC PROCESS DOCUMENT — v3.2. Client onboarding SOP.

Steps:
1. [Sales] Application received and logged in the CRM.
2. [Relationship manager] Send the document request email to the client.
3. [Client] Submit identity and address documents through the upload link.
4. [Operations] Check the documents against the checklist for the client type.
5. Are all documents complete and valid?
6. [Relationship manager] Chase the client for missing or unclear documents, then return to step 3.
7. [Compliance] Perform the KYC and source-of-funds review.
8. [Compliance] Request additional information from the client if needed, then repeat step 7.
9. [Operations] Set up the account in the core system.
10. [Relationship manager] Hold the welcome call with the client.
11. [Operations] Mark onboarding complete.

Notes: Target turnaround is not stated in this document. Ownership of the case between steps is not defined.`,
};

export const B_SOURCES = [
  {
    key: "a1", title: "Interview — Team admin, agency (synthetic)", type: "interview", participant: "P-A1", segment: "Team admins", date: "2025-05-05",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Team admin at a 12-person design agency. Interviewed 5 May 2025.

A1: The hardest part of setup was bringing our existing documents in. We had years of notes in another tool and the import kept failing on formatted tables.
A1: I gave up on the import after an hour and started fresh, which meant my team saw an empty workspace and lost interest.
A1: Inviting people was easy. The problem was that nobody knew what to do once they joined.`,
  },
  {
    key: "a2", title: "Interview — Team admin, consultancy (synthetic)", type: "interview", participant: "P-A2", segment: "Team admins", date: "2025-05-06",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Team admin at a small consultancy. Interviewed 6 May 2025.

A2: Importing our old files was painful and I had to fix formatting by hand for a whole afternoon. I nearly abandoned the trial because of it.
A2: I would happily pay someone to move the content for me. I do not want to learn the import tool.
A2: Once the content was in, the team started using it without much prompting.`,
  },
  {
    key: "a3", title: "Interview — Team admin, startup (synthetic)", type: "interview", participant: "P-A3", segment: "Team admins", date: "2025-05-07",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Team admin at an eight-person startup. Interviewed 7 May 2025.

A3: The import took two minutes and worked fine for us, so that was not a problem at all.
A3: What went wrong was that half the team accepted the invite and never came back. I think they did not see why they needed it.
A3: I sent a message in chat explaining what to do first, and the people who read it did start using the product.`,
  },
  {
    key: "m1", title: "Interview — Invited team member 1 (synthetic)", type: "interview", participant: "P-M1", segment: "Invited members", date: "2025-05-08",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Invited team member, designer. Interviewed 8 May 2025.

M1: I got an invite from my manager but I was not sure why I needed it or what I was supposed to do first.
M1: I opened the workspace once, saw a lot of pages I did not recognise, and closed it. I never went back.
M1: If it had told me one thing to do in the first minute I would probably have done it.`,
  },
  {
    key: "m2", title: "Interview — Invited team member 2 (synthetic)", type: "interview", participant: "P-M2", segment: "Invited members", date: "2025-05-09",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Invited team member, project coordinator. Interviewed 9 May 2025.

M2: The invitation email did not say what the tool was for, so I was not sure whether it was optional.
M2: I signed up, did not see anything relevant to my work, and went back to my old tool.
M2: My colleague showed me the shared project page on a call and then it made sense to me.`,
  },
  {
    key: "f1", title: "Interview — Freelancer (synthetic)", type: "interview", participant: "P-F1", segment: "Solo freelancers", date: "2025-05-12",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Solo freelance writer. Interviewed 12 May 2025.

F1: I opened the app and it was a blank page with no clue where to start. I did not know what the tool was good for.
F1: I liked the templates once I found them, but they were hidden in a menu I did not open at first.
F1: I would have kept using it if there had been a simple example to copy on the first screen.`,
  },
  {
    key: "f2", title: "Interview — Freelancer 2 (synthetic)", type: "interview", participant: "P-F2", segment: "Solo freelancers", date: "2025-05-13",
    content: `SYNTHETIC INTERVIEW NOTES — not real people or data.
Role: Solo freelance designer. Interviewed 13 May 2025.

F2: The blank workspace was confusing because there were no examples to show what I could build.
F2: I stopped after ten minutes. Setup was quick, the trouble was that I could not see the value.`,
  },
  {
    key: "tickets", title: "Support tickets — first-week themes (synthetic)", type: "support", participant: "", segment: "Mixed", date: "2025-05-20",
    content: `SYNTHETIC SUPPORT FEEDBACK — 6 tickets, invented for this demo.

T-101 (admin): Import failed on a table with merged cells. Is there a supported format list?
T-102 (member): I was invited but I cannot tell what I am supposed to do. Is this required for my job?
T-103 (freelancer): Where are the templates? I could not find them after signing up.
T-104 (admin): Imported pages lost their formatting and headers. We had to redo them by hand.
T-105 (member): The invite link worked but the workspace was empty for me. Am I in the right place?
T-106 (freelancer): It was not clear how to start a first page from an example.`,
  },
];
