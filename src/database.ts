import { InternalError } from "./error";

export interface Project {
  _id: number;
  name: string;
  cat: number;
  summary: string;
  members: string[];
}

interface GetResponse {
  documents: Project[];
}

interface VoteResponse {
  modifiedCount: number;
}

interface VoteNumber {
  _id: number;
  name: string;
  totalVotes: number;
}

interface GetVotesResponse {
  documents: VoteNumber[];
}

export default class Database {
  private _defaultOptions: RequestInit;

  constructor(private _baseURL: string, _apiKey: string) {
    this._defaultOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": _apiKey,
      },
    };
  }

  async getProjects() {
    const res = await fetch(`${this._baseURL}/action/find`, {
      ...this._defaultOptions,
      body: JSON.stringify({
        collection: "projects",
        database: "bentotec",
        dataSource: "Bentotec",
        projection: {
          votes: 0,
        },
      }),
    });

    if (res.status !== 200) {
      throw new InternalError("Error connecting to database.");
    }

    const data = await res.json<GetResponse>();
    return data.documents;
  }

  async vote(id: number, ip: string, userAgent: string) {
    const res = await fetch(`${this._baseURL}/action/updateOne`, {
      ...this._defaultOptions,
      body: JSON.stringify({
        collection: "projects",
        database: "bentotec",
        dataSource: "Bentotec",
        filter: {
          _id: id,
        },
        update: {
          $push: {
            votes: {
              ip,
              userAgent,
              time: new Date().toISOString(),
            },
          },
        },
      }),
    });

    if (res.status !== 200) {
      throw new InternalError("Error connecting to database.");
    }

    return (await res.json<VoteResponse>()).modifiedCount !== 0;
  }

  async getVotes() {
    const res = await fetch(`${this._baseURL}/action/aggregate`, {
      ...this._defaultOptions,
      body: JSON.stringify({
        collection: "projects",
        database: "bentotec",
        dataSource: "Bentotec",
        pipeline: [
          {
            $unwind: {
              path: "$votes",
            },
          },
          {
            $group: {
              _id: {
                ip: "$votes.ip",
                id: "$_id",
              },
              name: {
                $first: "$name",
              },
              votes: {
                $sum: 1,
              },
            },
          },
          {
            $addFields: {
              cappedVotes: {
                $cond: [
                  {
                    $gt: ["$votes", 10],
                  },
                  10,
                  "$votes",
                ],
              },
            },
          },
          {
            $group: {
              _id: "$_id.id",
              name: {
                $first: "$name",
              },
              totalVotes: {
                $sum: "$cappedVotes",
              },
            },
          },
          {
            $sort: {
              totalVotes: -1,
            },
          },
        ],
      }),
    });

    if (res.status !== 200) {
      throw new InternalError("Error connecting to database.");
    }

    const data = await res.json<GetVotesResponse>();
    return data.documents;
  }
}
