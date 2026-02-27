## prompt:

I want you to create a rough plan for implementation of a multi agent system that  overall it needs to accomplish a task, but in each task, it needs to have multiple agents on it for example Grounding, Cognition, Agency, and Interface agents. These are the guardrail agents for every task, but within each task it also need to in instantiate or trigger other sub agents.


Let's say we are in a marketing platform company, we have a client (as a marketer) that is chatting with the main LLM as the top-level agent, something like this: "Escalate to human if core cohort shrinks by 5%", then, this top-level agent, break the task into smaller ones, with having grounding, recognition, agency, and interface agents as guardrail for the whole task.

First, the grounding agent comes to check the baseline and soul.md and then Cognition agent gathers  all the necessary information and the context. once it is done, the Agency agent comes to play and it can trigger the Fashion Agent to check the cohort then once this agent finished its job, the Agency agent, passes the output to the Interface agent, and Interface agent, triggers the Notification Manager agent, then that one, sends a message (through an MCP server or an API call) to the marketer (via Email, Slack etc.), once the notification manager agent job is done, it comes back to the agency agent, and the top-level agent informs the marketer about the result.



 

Conditions:

- These agents should work in parallel to not to wait so long for a task, feel free to integrate with multiple models at the same time, Claude, OpenAI, Gemeni, etc.

- Feel free to choose your model based on the agent or sub-agent task

- the top-level always need to have the current status of the task (Waiting, In progress, Failed, Successful , etc.)

- if triggering a sub agent fails, try to trigger a different model for the same task

- for whatever reason something breaks, it triggers human-in-the-loop to inform the marketer as well as the top-level admin (meaning us, we designed the system)



