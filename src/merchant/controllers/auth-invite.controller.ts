import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { InviteService } from '../services/invite.service';
import { Public } from '../../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../../auth/dto/response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthInviteController {
  private readonly logger = new Logger(AuthInviteController.name);

  constructor(private readonly inviteService: InviteService) {}

  @Get('invite')
  @Public()
  @ApiOperation({
    summary: 'Look up an invite by token (public)',
    description:
      'Returns basic invite info (email, name, merchantName) for a valid invite token. ' +
      'Used by the frontend registration page to pre-fill the staff member details.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'The invite token from the invitation email',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Invite info retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            email: { type: 'string', example: 'staff@example.com' },
            name: { type: 'string', example: 'Jane Doe', nullable: true },
            merchantName: { type: 'string', example: 'Joe\'s Restaurant' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already used invite token', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Invite token not found', type: ErrorResponseDto })
  async getInviteByToken(@Query('token') token: string) {
    const invite = await this.inviteService.validateToken(token);
    return {
      status: 'success',
      data: {
        email: invite.email,
        name: invite.name || null,
        merchantName: invite.merchant.name,
      },
    };
  }
}
