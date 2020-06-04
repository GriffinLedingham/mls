import * as fs from 'fs'
import * as request from 'request-promise'
import * as nodemailer from 'nodemailer'

import config from '../config'

const senderEmail = config.emailSender
const senderPass = config.emailPass
const toEmails = config.emailRecipients

export function post(url, data) {
    return request({
        url: url,
        method: 'POST',
        json: true,
        body: data,
        timeout: 500
    })
}

export function get(url) {
    return request({
        url: url,
        method: 'GET'
    }).catch((e) => {
        console.log(e)
    })
}

export function getFile(fileName) {
    return new Promise(function(resolve, reject){
        fs.readFile(fileName, (err, data) => {
            err ? reject(err) : resolve(data.toString());
        });
    });
}

export function sendEmail(subject: string, body: string) {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: senderEmail,
          pass: senderPass
        }
    });

    var mailOptions = {
        from: senderEmail,
        to: toEmails,
        subject: subject,
        html: body
    };

    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}
