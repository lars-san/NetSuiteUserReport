/**
 *	MIT License
 *	Copyright (c) 2023 Lars White
 *
 *	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 *	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 *	THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/**
 *	NetSuite Script ID:		customscript_taco_users_report_mrs
**/
/**
 *	Instructions:
 *
 *	To install/setup this Script in NetSuite do the following:
 *	- Create a new Script record using this .js file (detailed instructions: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4489062315.html#Creating-a-Script-Record)
 *	- Create the following Script Parameters:
 *		- Run in Sandbox
 *			Label:			Run in Sandbox
 *			ID:				custscript_taco_user_report_sb
 *			Description:	This check box can be used to restrict the script to operate only in production. This is desirable when admins get all emails sent in non-production environments, and reports like this one are not (usually) critical outside of production.
 *			Type:			Check Box
 *			Display>Help:	Check this box if this report needs to be generated outside of production.
 *		- Directory ID
 *			Label:			Directory ID
 *			ID:				custscript_taco_user_report_dir_id
 *			Description:	The Internal ID of the directory/folder that will house the csv version of these reports in NetSuite's File Cabinet must be populated here.
 *			Type:			Integer Number
 *			Display>Help:	Populate with the Internal ID of the directory/folder that will house the csv version of these reports in NetSuite's File Cabinet.
 *		- Email Recipients
 *			Label:			Email Recipients
 *			ID:				custscript_taco_user_report_recipients
 *			Description:	Populate this field with the email address(es) that should receive the report. Separate multiple email addresses with a semicolon. There can be up to 10 recipients.
 *			Type:			Email Address
 *			Display>Help:	Populate with the email address(es) that should receive the report. Separate multiple email addresses with a semicolon. There can be up to 10 recipients.
 *		- Email Author
 *			Label:			Email Author
 *			ID:				custscript_taco_user_report_author
 *			Description:	Populate this field with the Employee that will be associated with sending out these reports.
 *			Type:			List/Record
 *			List/Record:	Employee
 *			Display>Help:	Select the Employee record that will be associated with sending out these reports.
 */
/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N', 'N/error', 'N/record', 'N/runtime', 'N/search', 'N/file', 'N/query', 'N/email', 'N/render'],
/**
 * @param {N} N
 * @param {error} error
 * @param {runtime} runtime
 * @param {search} search
 */
function(N, error, record, runtime, search, file, query, email, render) {

	daysBetween = (dateOne) => {
		let dateTwo = new Date();												// Get the current date/time.
		if(dataExists(dateOne)) {
			let timeDiff = Math.abs(dateTwo - dateOne);							// Subtracting dates like this will give the number of milliseconds between the two dates.
			let daysOfDifference = Math.floor(timeDiff / (1000 * 60 * 60 * 24));	// (milliseconds/second x seconds/minute x minutes/hour x hours/day)
			return daysOfDifference;
		}
		else { return 'Not Available'; }
   }

	dataExists = (value) =>	{
		if(value !='null' && value != null && value != '' && value != undefined && value != 'undefined' && value != 'NaN' && value != NaN && value != 'Invalid Date') 
		{ return true; }
		else 
		{ return false;	}
	}

	todaysDate = () => {
		let d = new Date(),
			month = '' + (d.getMonth() + 1),
			day = '' + d.getDate(),
			year = d.getFullYear();

		if (month.length < 2) 
			month = '0' + month;
		if (day.length < 2) 
			day = '0' + day;

		return [year, month, day].join('-');
	}


	// This process begins by creating a search object that will find all Employee records that have access to NetSuite.
	getInputData = (context) => {
		// Check to see if the environment is production or not (production accountId's will be an integer, other account types will have letters as well).
		let nsAccId = runtime.accountId;
		let scriptRecord = runtime.getCurrentScript();
		let sandboxEnabled = runtime.getCurrentScript().getParameter('custscript_taco_user_report_sb');
		// Depending on the Script Deployment setup, this Script will effectively stop here in a non-production account. The reason for this is to allow this script to be automatically turned off in sandboxes upon a refresh.
		if(isNaN(nsAccId)) {
			if(!sandboxEnabled) {
				log.audit('The option to run outside production is not checked. Stopping process.');
				return;
			}
		}

		// The following Employee search could be expanded upon to reduce lookups in reduce().
		let savedSearchObj = search.create({
			type: "employee",
			filters:
			[
				["access","is","T"]
			],
			columns:
			[
				search.createColumn({
					name: "internalid",
					sort: search.Sort.ASC
				}),
				"firstname",
				"lastname",
				"email"
			]
		});
		return savedSearchObj;	// This search object is passed to map() without explicitly running it.
	}

	// map() automatically gets the results of the search one at a time. Values needed in reduce() must be written to context.
	map = (context) => {
		let mapData = JSON.parse(context.value);
		let internalId = context.key;
		let firstLast = mapData.values.firstname.trim() + ' ' + mapData.values.lastname.trim();
		// Remove all commas and semicolons from the name. Presumably there will not be any. But, it is better to know there are none.
		firstLast.replace(/,/g, '');
		firstLast.replace(/;/g, '');
		let email = mapData.values.email
		let employeeDetails = firstLast + ';' + email;
log.debug('map()',internalId + ' ' + employeeDetails);
		context.write(internalId,employeeDetails);
	}

	// reduce() has a lot to do.
	reduce = (context) => {
		let empId = context.key;						// This is the Employee Internal ID.
		let rawReduceValues = JSON.stringify(context.values);
		let reduceValues = rawReduceValues.substring(2,rawReduceValues.length - 2);
		let lineInfo = reduceValues.split(';');
		let firstLast = lineInfo[0];
		let email = lineInfo[1];
		let dateProvisioned;// = "1/1/2000";
		let employeeSearchObj = search.create({
			type: "employee",
			filters:
			[
				["access","is","T"], 
				"AND", 
				["systemnotes.field","anyof","ENTITY.BHASACCESS"], 
				"AND", 
				["systemnotes.newvalue","is","T"], 
				"AND", 
				["internalidnumber","equalto",empId]
			],
			columns:
			[
				search.createColumn({
					name: "internalid",
					summary: "GROUP",
					sort: search.Sort.ASC
				}),
				search.createColumn({
					name: "entityid",
					summary: "GROUP"
				}),
				search.createColumn({
					name: "date",
					join: "systemNotes",
					summary: "MAX"
				})
			]
		});
		employeeSearchObj.run().each(function(result){
			dateProvisioned = result.getValue({
				"name": "date",
				"join": "systemNotes",
				"summary": "MAX"
			});
			return false;
		});

		// The login audit trail search is not available using SuiteScript, so query (SuiteAnalytics) is used instead.
		let loginQuery = query.create({
			type: 'LoginAudit'
		});
		loginQuery.columns = [									// Create the query columns/results
			loginQuery.createColumn({fieldId: 'date', aggregate: query.Aggregate.MAXIMUM_DISTINCT})];
		loginQuery.condition = loginQuery.createCondition({
			fieldId: 'user',
			operator: query.Operator.EQUAL,
			values: empId
		});
		let resultSet = loginQuery.run();						// Run the query
		let result = resultSet.asMappedResults()				// Retrieve and log the results
		let lastLoginDate = result[0].date;
		let greaterDate;

		let lastLogin;
		if(dataExists(lastLoginDate)) { lastLogin = lastLoginDate.substring(3,5) + '/' + lastLoginDate.substring(0,2) + '/' + lastLoginDate.substring(6,10); }
		let dateProv;
		if(dataExists(dateProvisioned)) { dateProv = dateProvisioned.substring(3,5) + '/' + dateProvisioned.substring(0,2) + '/' + dateProvisioned.substring(6,10); }
		else {
			let fieldLookUp = search.lookupFields({
				type: 'employee',
				id: empId,
				columns: ['datecreated']
			});
log.debug('reduce(): fieldLookUp', fieldLookUp);
		}

		let lastLoginCompareDate = new Date(lastLoginDate);//lastLogin);
		let dateProvisionedCompare = new Date(dateProvisioned);//dateProv);
		if(!dataExists(lastLoginCompareDate)) { lastLoginCompareDate = 0;}
		if(!dataExists(dateProvisionedCompare)) { dateProvisionedCompare = 0;}

		// Compare provisioned user access date against last log-in date
		let daysFromLastLogin = 0;
		if(dateProvisionedCompare >= lastLoginCompareDate) {
			daysFromLastLogin = daysBetween(dateProvisionedCompare);
			greaterDate = dateProvisioned;
		} else if(lastLoginCompareDate > dateProvisionedCompare) {
			daysFromLastLogin = daysBetween(lastLoginCompareDate);
			greaterDate = lastLoginDate;
		} else {
		   if(dateProvisionedCompare) {
			   daysFromLastLogin = daysBetween(dateProvisionedCompare);
			   greaterDate = dateProvisioned;
			   
		   } 
		   if(lastLoginCompareDate) {
			   daysFromLastLogin = daysBetween(lastLoginCompareDate);
			   greaterDate = lastLoginDate;
		   }
		}
		let licType = '';
		let notes = '';
		let centerType;
		let roleId;
		let SAML = 0;
		if(daysFromLastLogin > 90) {
			notes = 'Removing Access';
		}
		// Check if the user is an admin
		let employeeRoleSearchObj = search.create({
			type: "employee",
			filters: [
				["internalidnumber","equalto",empId]
			],
			columns: [
				search.createColumn({
					name: "centertype",
					join: "role"
				}),
				"role"
			]
		});
//		let searchResultCount = employeeRoleSearchObj.runPaged().count;
		employeeRoleSearchObj.run().each(function(result){
//log.debug('role result',result);
			// .run().each has a limit of 4,000 results
			centerType = result.getValue({
				"name": "centertype",
				"join": "role"
			});
			if(centerType == 'EMPLOYEE' && licType != 'Full') {
				licType = 'Employee Center';
			}
			else { licType = 'Full'; }
			roleId = result.getValue({
				"name": "role"
			});
			//--------------------------------
			let roleSearchObj = search.create({
				type: "role",
				filters:
				[
					["permission","anyof","ADMI_SAMLSSO"], 
					"AND", 
					["internalidnumber","equalto",roleId]
				],
				columns:
				[
					"permission",
					"level"
				]
			});
			roleSearchObj.run().each(function(roleResult){
				//
//log.debug('roleSearch: roleId:roleResult',roleId + ':' + roleResult);
				SAML = roleResult.getValue({
					"name": "level"
				});
				if(SAML != 4 && notes != 'Admin') {
					notes = 'Non-SAML';
				}
				return false;							// There will only be one result. So, this can be false.
			});
			// The above section will catch any roles where the "SAML Single Sign-on" permission is listed, but not set to "Full".  If a role does not have the SAML permission listed at all (0 results on the above search), then the role is not SAML enabled.
			if(SAML != 4 && notes != 'Admin') { notes = 'Non-SAML'; }
			//--------------------------------
			if(roleId == 3) {	// Normally the "Administrator" role has an Internal ID of '3'.
				notes = 'Admin';
			}
			return true;
		});

		if(dataExists(firstLast)) {
			let outputToFile = firstLast + ',' + email + ',' + licType + ',' + greaterDate + ',' + daysFromLastLogin + ',' + notes;
			context.write(empId, outputToFile);
		}
	}

	// The summarize function will be used to output the context written from the reduce function to a csv file.
	summarize = (summary) => {
		log.audit('summarize() entered');
		// data into array
		let scriptRecord = runtime.getCurrentScript();											// This must be declared again in order for us to grab a parameter from the deployment.
		let directoryId = scriptRecord.getParameter({name:'custscript_taco_user_report_dir_id'});	// Get the Internal ID of the chosen directory from the deployment.
		let contents = 'Internal ID,Name,User Name,License Type,Last Log-in Date,Days Since Logged In,Notes\n';						// The header for the csv file is this first line.
		let fileName = todaysDate() + '-UsersReport.csv';										// The filename will be something like 2020-12-31-unbilledData.csv. This uses another function to get the date in a more readable format.
		// Going through all the data recieved at this stage, populate the contents variable, keeping in mind this will be a csv format.
		let dataArray = [];
		let dataLine;
//		let remArray = [];
		summary.output.iterator().each(function(key, value) {
			if(dataExists(value)) {
				dataLine = value.split(',');
				dataArray.push([key, dataLine[0], dataLine[1], dataLine[2], dataLine[3], dataLine[4], dataLine[5]]);
				// If a user is over the 90 day mark, add them to an array so they can be removed later.
//				if(dataLine[5] == 'Removing Access') {
//					remArray.push(key);
//				}
			}
			return true;
		});
		// Sort the output
		dataArray.sort(function(a, b){return b[5]-a[5]});
		// Make the HTML version of the data, which will go in the email body.
		let htmlTable = '<table><tr class="the-table-header"><td>Name</td><td>Days Since Logged In</td><td>Notes</td></tr>';
		for(let i=0;i<dataArray.length;i++) {
			htmlTable = htmlTable + '<tr><td>' + dataArray[i][1] + '</td><td>' + dataArray[i][5] + '</td><td>' + dataArray[i][6] + '</td></tr>';
//			for(let j=0;j<o_tableMap.array.length -1;j++) {
//				if(sortedData[i][14] == 0) { htmlTable = htmlTable + "<td><b>" + sortedData[i][o_tableMap.array[j]] + "</b></td>"; }
//				else { htmlTable = htmlTable + "<td>" + sortedData[i][o_tableMap.array[j]] + "</td>"; }
//			}
//			htmlTable = htmlTable + "</tr>";
		}
		htmlTable = htmlTable + "</table>";
		// Create the output file object, and populate it with the content/text generated above.
		// Make content spit out in csv file using a for loop
		for(let i = 0; i < dataArray.length; i++) {
			contents += dataArray[i] + '\n';           
		}

		let fileObj = file.create({
			name: fileName,
			fileType: file.Type.PLAINTEXT,
			contents: contents
		});
		// Specify the folder location for the output file. Update the fileObj.folder property with the ID of the folder in the file cabinet that is to contain the output file.
		fileObj.folder = directoryId;
		// Save the file.
		let fileIntId = fileObj.save();
		log.audit('summarize(): report generated','fileIntId: ' + fileIntId);
		// Email the report to the addresses listed in the Script Deployment.

		//Load script parameters for e-mail into variables
		let emailRecipientsField = runtime.getCurrentScript().getParameter('custscript_taco_user_report_recipients');
		emailRecipientsField = emailRecipientsField.split(';');    // This allows for multiple email recipients, separated by semicolon(s).
		let emailAuthorField = runtime.getCurrentScript().getParameter('custscript_taco_user_report_author');			// This needs to be an Employee record.
		let emailSubject = 'NetSuite Users Report';
		let bodyMessage = 
			'<html>' +
			'<head>' +
			'<style>' +
			'body {font-family:Verdana,sans-serif;font-size:15px;line-height:1.5;background-color:#00467f;overflow-x:hidden}' +
			'code {font-family:monospace;font-size:1em;color:#eeeeee;background-color:#111111;}' +
			'.the-main {position:relative;top:45px;transition:margin-left 0.4s;color:#fff;background-color:#000000;padding-top:25px;}' +
			'.the-section {max-width:800px;margin:auto;margin-bottom:25px;background-color:#222222;padding:60px 85px 60px 85px;}' +
			'.the-table-header {color:#ffffff;background-color:#00467f;}' +
			'</style>' +
			'</head>' +
			'<body>' +
			'<div class="the-main">' +
				'<div class="the-section">' +
					htmlTable +
					"<br/>" +
					"<i>This was generated by the Script with ID:</i> <code>customscript_taco_users_report_mrs</code>" +
				'</div>' +
			'</div>';
	   let sendOptions = {
		   author: emailAuthorField,								      
		   recipients: emailRecipientsField,		    
		   replyTo: 'donotreply@donotreply.com',
		   subject: emailSubject,
		   body: bodyMessage,
		   attachments: [fileObj]
	   };
	   log.audit('renderAndSendEmail(): sendOptions',sendOptions);
	   try {
		   email.send(sendOptions);
		   return true;
	   }
	   catch(e) {
		   let msg = '';
		   if (e instanceof nlobjError) {
			   msg = e.getCode() + '\n' + e.getDetails();
			   log.error({
				   title: 'system error',
				   details: msg
			   });

		   } else {
			   msg = e.toString();
			   log.error({
				   title: 'unexpected error',
				   details: msg
			   });
		   }
		   return false;
	   }
	   //--------------------------------
	}

	return {
		getInputData: getInputData,
		map: map,
		reduce: reduce,
		summarize: summarize 
	};
});
