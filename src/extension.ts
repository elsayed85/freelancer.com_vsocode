import * as vscode from 'vscode';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config({
	path: __dirname + '/../.env'
});


async function generateProposal(job: any, owner_name: string) {
	const jobDescription = sanitizeText(job.description);
	const clientName = owner_name;
	const budget = job.budget;
	const currency = job.currency.code;

	const min = budget.minimum;
	const max = budget.maximum;

	const avg = (min + max) / 2;
	const formattedBudget = `${min} - ${max} ${currency}`;
	// load from env
	const aboutMe = sanitizeText(process.env.ABOUT_ME || '');
	const prompt = ` ${aboutMe} Reply with a proposal for job description. Job description: ${jobDescription} Client name: ${clientName} Budget: ${formattedBudget} Average: ${avg} ${currency} Proposal:`;
	return await aiGenerate(prompt);
}

function sanitizeText(text: string) {
	return text
		.replace(/\s+/g, ' ')
		.replace(/<\/?[^>]+(>|$)/g, '')
		.replace(/[^A-Za-z0-9\-]/g, ' ')
		.replace(/\s+/g, ' ');
}

async function aiGenerate(prompt: string) {
	const token = process.env.OPENAI_API_KEY;
	const response = await axios.post(
		'https://api.openai.com/v1/chat/completions',
		{
			model: 'gpt-3.5-turbo',
			messages: [
				{
					role: 'user',
					content: prompt,
				},
			],
			temperature: 0.7,
		},
		{
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
		}
	);


	return response.data.choices[0].message.content;
}

function storeProposal(context: vscode.ExtensionContext, jobId: number, proposal: string) {
	context.globalState.update(`proposal_for_job_id_${jobId}`, proposal);
}

function clearProposal(context: vscode.ExtensionContext, jobId: number) {
	context.globalState.update(`proposal_for_job_id_${jobId}`, undefined);
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'freelancerJobsView',
			new FreelancerJobProvider()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'freelancerJobs.openInBrowser',
			(jobItem: JobItem) => {
				vscode.env.openExternal(vscode.Uri.parse(`https://www.freelancer.com/projects/${jobItem.job.seo_url}`));
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('freelancerJobs.openJobDetails', async (jobItem: JobItem) => {

			const panel = vscode.window.createWebviewPanel(
				'jobDetails',
				`${jobItem.job.title} Details`,
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);
			const owner = await getOwner(jobItem.job.owner_id);
			const jobId = jobItem.job.id;
			let proposal = context.globalState.get(`proposal_for_job_id_${jobId}`);
			panel.webview.html = await getJobDetailsHTML(jobItem.job, proposal as string, owner);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'freelancerJobs.generateProposal',
			async (jobItem: JobItem) => {
				// vscode.window.showInformationMessage(`Proposal Generated for: ${jobItem.job.title}`);
				// Open job details with the proposal string appended to the table
				const panel = vscode.window.createWebviewPanel(
					'jobDetails',
					`${jobItem.job.title} Details`,
					vscode.ViewColumn.One,
					{
						enableScripts: true,
						retainContextWhenHidden: true,
					}
				);
				const owner = await getOwner(jobItem.job.owner_id);
				const jobId = jobItem.job.id;
				let proposal = context.globalState.get(`proposal_for_job_id_${jobId}`);

				// Note the change in the next line — fetch proposal only if it's not in globalState
				if (!proposal) {
					proposal = await generateProposal(jobItem.job, owner.public_name);
					storeProposal(context, jobId, proposal as string);
				}
				panel.webview.html = await getJobDetailsHTML(jobItem.job, proposal as string, owner);
			}
		)
	);

	// clear proposal 
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'freelancerJobs.clearProposal',
			async (jobItem: JobItem) => {
				const jobId = jobItem.job.id;
				clearProposal(context, jobId);
			}
		)
	);
}

async function getJobDetailsHTML(job: any = {}, proposal: string = '', owner: any = {}) {
	return `<html>
	<head>
	  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.0.0-alpha.20/dist/tailwind.min.css" rel="stylesheet">
	</head>
	<body class="font-sans">
	  <h1 class="text-2xl font-bold mb-4">${job.title}</h1>
	  <table class="w-full border-collapse">
		<tr class="border-b">
		  <th class="text-left p-4">Owner:</th>
		  <td class="p-4 flex items-center">
			<img src="https:${owner.avatar_cdn}" width="20" height="20" class="rounded-full mr-2"/>
			<strong>${owner.public_name}</strong> @${owner.username}
		  </td>
		</tr>
		<tr class="border-b">
		  <th class="text-left p-4">Location:</th>
		  <td class="p-4">${job.location.country.name} | ${job.location.administrative_area}</td>
		</tr>
		<tr class="border-b">
		  <th class="text-left p-4">Description:</th>
		  <td class="p-4">
			<pre class="whitespace-pre-wrap">${job.description}</pre>
		  </td>
		</tr>
		<tr class="border-b">
		  <th class="text-left p-4">Budget:</th>
		  <td class="p-4">${job.currency.code} ${job.budget.minimum} - ${job.currency.code} ${job.budget.maximum}</td>
		</tr>
		<tr class="border-b">
		  <th class="text-left p-4">Currency:</th>
		  <td class="p-4">${job.currency.name} (${job.currency.code})</td>
		</tr>
		<tr class="border-b">
		  <th class="text-left p-4">Bids Count:</th>
		  <td class="p-4">${job.bid_stats.bid_count}</td>
		</tr>
		<tr class="border-b">
		  <th class="text-left p-4">Project Type:</th>
		  <td class="p-4">${job.type}</td>
		</tr>
		<tr>
		  <th class="text-left p-4">Generated Proposal:</th>
		  <td class="p-4">
			<pre class="whitespace-pre-wrap">${proposal}</pre>
		  </td>
	  </tr>
	  </table>
	</body>
  </html>`;
}

class JobItem extends vscode.TreeItem {
	constructor(public readonly job: any) {
		super(job.title, vscode.TreeItemCollapsibleState.Collapsed);
		this.description = `${job.currency.code} ${job.budget.minimum} - ${job.currency.code} ${job.budget.maximum}`;
		this.contextValue = 'jobItem';
		this.command = {
			command: 'freelancerJobs.openJobDetails',
			title: 'Open Job Details',
			arguments: [this],
		};
	}
}

class JobDetailItem extends vscode.TreeItem {
	constructor(public readonly detailKey: string, public readonly detailValue: string) {
		super(
			`${detailKey}: ${detailValue}`,
			vscode.TreeItemCollapsibleState.None
		);
	}

	tooltip = `${this.detailKey}: ${this.detailValue}`;
}

class FreelancerJobProvider
	implements vscode.TreeDataProvider<vscode.TreeItem> {
	public currentPage: number = 1;

	async getChildren(element?: JobItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			const jobs = await fetchFreelancerJobs(this.currentPage);
			return jobs.map(
				(job: any) => new JobItem(job)
			);
		}

		// Expandable detail items
		const job = element.job;
		var location = job.location.country.name;
		return [
			new JobDetailItem("Location", location),
			new JobDetailItem("Budget", `${job.currency.code} ${job.budget.minimum} - ${job.currency.code} ${job.budget.maximum}`),
			new JobDetailItem("Currency", `${job.currency.name} (${job.currency.code})`),
			new JobDetailItem("Bids Count", job.bid_stats.bid_count),
			new JobDetailItem("Project Type", job.type)
		];
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}
}

async function getOwner(owner_id: number) {
	const url = 'https://www.freelancer.com/api/users/0.1/users';
	const parameters = {
		avatar: 'true',
		badge_details: 'true',
		country_details: 'true',
		display_info: 'true',
		employer_reputation: 'true',
		jobs: 'true',
		location_details: 'true',
		membership_details: 'true',
		preferred_details: 'true',
		qualification_details: 'true',
		responsiveness: 'true',
		reputation: 'true',
		sanction_details: 'true',
		status: 'true',
		'users[]': owner_id,
		profile_description: 'true',
		marketing_mobile_number: 'true',
		webapp: '1',
		compact: 'true',
		new_errors: 'true',
		new_pools: 'true',
	};

	const response = await axios.get(url, { params: parameters });

	console.log("owner ", response.data);

	return response.data.result.users[owner_id];
}

async function fetchFreelancerJobs(page = 1) {
	const url = 'https://www.freelancer.com/api/projects/0.1/projects/active';

	const LARAVEL = '669';
	const LIMIT = 50;
	const OFFSET = (page - 1) * LIMIT;

	let parameters = {
		limit: LIMIT,
		offset: OFFSET,
		full_description: true,
		job_details: true,
		local_details: true,
		location_details: true,
		upgrade_details: true,
		user_country_details: true,
		user_details: true,
		user_employer_reputation: true,
		user_status: true,
		'jobs[]': LARAVEL,
		'languages[]': 'en',
		sort_field: 'submitdate',
		webapp: 1,
		compact: true,
		new_errors: true,
		new_pools: true,
	};

	const response = await axios.get(url, { params: parameters });

	return response.data.result.projects;
}