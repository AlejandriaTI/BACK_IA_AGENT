import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios'; // Cambiado de @nestjs/common a @nestjs/axios
import * as querystring from 'querystring';
import axios from 'axios';

interface KommoAuthResponse {
  access_token: string;
  refresh_token: string;
}
// Define la interfaz para el body del webhook (puedes ajustarlo a las necesidades reales de tu webhook)
interface WebhookBody {
  lead_id: string;
  status: string;
  [key: string]: any; // Puedes agregar más campos según lo que necesites recibir
}

// Define la interfaz para la respuesta que retornará el método
interface WebhookResponse {
  success: boolean;
  message?: string;
}

@Injectable()
export class KommoService {
  private readonly CLIENT_ID = 'YOUR_KOMMO_CLIENT_ID';
  private readonly CLIENT_SECRET = 'YOUR_KOMMO_CLIENT_SECRET';
  private readonly REDIRECT_URI = 'YOUR_REDIRECT_URI'; // La URL a la que Kommo redirige después de la autorización
  private readonly AUTH_URL = 'https://your-domain.amocrm.com/oauth2/authorize';
  private readonly TOKEN_URL =
    'https://your-domain.amocrm.com/oauth2/access_token';
  private readonly API_URL = 'https://your-domain.amocrm.com/api/v4';

  private accessToken: string;
  private refreshToken: string;

  constructor(private readonly httpService: HttpService) {}

  // Método para autenticar con OAuth2
  async authenticate(code: string): Promise<void> {
    const body = querystring.stringify({
      client_id: this.CLIENT_ID,
      client_secret: this.CLIENT_SECRET,
      code: code,
      redirect_uri: this.REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    // Asegúrate de que la respuesta esté tipada
    const response = await axios.post<KommoAuthResponse>(this.TOKEN_URL, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
  }

  // Método para obtener los leads
  async getLeads(): Promise<any> {
    const response = await axios.get(`${this.API_URL}/leads`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    return response.data;
  }

  // Método para refrescar el token (cuando el token expira)
  async refreshAccessToken(): Promise<void> {
    const body = querystring.stringify({
      client_id: this.CLIENT_ID,
      client_secret: this.CLIENT_SECRET,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await axios.post<KommoAuthResponse>(this.TOKEN_URL, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
  }

  async handleWebhook(data: WebhookBody): Promise<WebhookResponse> {
    // Lógica para procesar el webhook (por ejemplo, guardar leads, actualizar datos, etc.)
    console.log('Webhook received:', data);

    // Simulamos una operación asincrónica, como guardar los leads en la base de datos
    await this.saveLeadData(data);

    return { success: true };
  }

  // Simulando un método de guardado asincrónico de datos
  async saveLeadData(data: any): Promise<void> {
    // Aquí podrías agregar código para guardar los leads en la base de datos
    console.log('Saving lead data...', data);
    return new Promise((resolve) => setTimeout(resolve, 2000)); // Simula un retraso
  }
}
